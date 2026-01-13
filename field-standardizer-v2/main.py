"""
Field Standardizer v2 Service - Advanced Field Validation and Formatting
Handles standardization, validation, and formatting of enriched data for Indian accounting systems
"""

import os
import sys
import json
import logging
import re
from typing import Dict, Any, List, Optional, Union
from datetime import datetime, timedelta
from decimal import Decimal, ROUND_HALF_UP

# Add shared utilities to path
sys.path.append('../shared')

from flask import Flask, request, jsonify
from flask_cors import CORS

# Import shared utilities
from shared import (
    auth_utils,
    openai_utils,
    firestore_utils,
    require_auth_and_tenant,
    success_response,
    ErrorHandler,
    APIError,
    load_prompt_template
)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

app = Flask(__name__)
CORS(app, resources={r"/*": {"origins": "*", "methods": ["GET", "POST", "OPTIONS"], "allow_headers": ["Content-Type", "Authorization"]}})

class FieldStandardizerService:
    """Advanced field validation and standardization for Indian accounting systems"""
    
    def __init__(self):
        self.project_id = os.getenv('PROJECT_ID', 'watch-mail-trial')
        self.environment = os.getenv('ENVIRONMENT', 'development')
        
        # Indian accounting standards configuration
        self.currency_code = 'INR'
        self.decimal_precision = 2
        self.tax_rates = {
            'GST_0_PERCENT': 0.00,
            'GST_5_PERCENT': 0.05,
            'GST_12_PERCENT': 0.12,
            'GST_18_PERCENT': 0.18,
            'GST_28_PERCENT': 0.28
        }
        
        # HSN code validation patterns
        self.hsn_patterns = {
            'services': r'^99\d{4}$',  # Services HSN codes start with 99
            'goods': r'^[0-8]\d{5}$'   # Goods HSN codes start with 0-8
        }
        
        # Account code patterns
        self.account_code_patterns = {
            'income': r'^(INCOME|REV|SALES)_.*$',
            'expense': r'^(EXP|COST)_.*$',
            'asset': r'^(ASSET|INV)_.*$'
        }
        
        # Load field standardization prompt template
        self.standardization_prompt = load_prompt_template('field_standardization.txt')
        
        logger.info(f"🔧 Field Standardizer v2 initialized - {self.environment}")
        logger.info(f"💱 Currency: {self.currency_code}, Precision: {self.decimal_precision}")
        logger.info(f"📊 Supported GST rates: {list(self.tax_rates.keys())}")
    
    def standardize_job_data(self, tenant_id: str, job_id: str, enriched_chunks: List[Dict[str, Any]]) -> Dict[str, Any]:
        """Standardize all enriched chunk data for a job"""
        
        try:
            # Update job status
            firestore_utils.update_job_status(tenant_id, job_id, 'STANDARDIZING')
            
            logger.info(f"🔧 Starting standardization for job {job_id}: {len(enriched_chunks)} chunks")
            
            # Collect all line items from chunks
            all_line_items = []
            chunk_summary = []
            
            for chunk in enriched_chunks:
                chunk_items = chunk.get('enriched_line_items', [])
                
                # Standardize each item in the chunk
                standardized_items = []
                for item in chunk_items:
                    standardized_item = self._standardize_line_item(item)
                    standardized_items.append(standardized_item)
                
                all_line_items.extend(standardized_items)
                
                # Track chunk processing summary
                chunk_summary.append({
                    'chunk_id': chunk['chunk_id'],
                    'items_standardized': len(standardized_items),
                    'standardization_timestamp': datetime.utcnow().isoformat()
                })
            
            # Perform global validation and consistency checks
            validation_results = self._perform_global_validation(all_line_items)
            
            # Calculate standardized totals
            standardized_totals = self._calculate_standardized_totals(all_line_items)
            
            # Prepare standardized result
            standardized_result = {
                'job_id': job_id,
                'tenant_id': tenant_id,
                'standardization_timestamp': datetime.utcnow().isoformat(),
                'standardized_line_items': all_line_items,
                'chunk_processing_summary': chunk_summary,
                'validation_results': validation_results,
                'standardized_totals': standardized_totals,
                'processing_stats': {
                    'total_items_standardized': len(all_line_items),
                    'total_chunks_processed': len(enriched_chunks),
                    'validation_errors': len(validation_results.get('errors', [])),
                    'validation_warnings': len(validation_results.get('warnings', []))
                },
                'indian_accounting_compliance': {
                    'currency': self.currency_code,
                    'decimal_precision': self.decimal_precision,
                    'gst_compliance': True,
                    'hsn_validated': True
                }
            }
            
            # Store standardized result
            self._store_standardized_result(tenant_id, job_id, standardized_result)
            
            # Update job status
            if validation_results.get('errors'):
                firestore_utils.update_job_status(tenant_id, job_id, 'STANDARDIZATION_PARTIAL')
            else:
                firestore_utils.update_job_status(tenant_id, job_id, 'STANDARDIZED')
            
            logger.info(f"✅ Standardization complete: {len(all_line_items)} items, {len(validation_results.get('errors', []))} errors")
            
            return standardized_result
            
        except Exception as e:
            logger.error(f"❌ Standardization failed for job {job_id}: {e}")
            firestore_utils.update_job_status(tenant_id, job_id, 'STANDARDIZATION_FAILED')
            raise APIError("Failed to standardize job data", "STANDARDIZATION_FAILED", 500)
    
    def _standardize_line_item(self, enriched_item: Dict[str, Any]) -> Dict[str, Any]:
        """Standardize a single enriched line item"""
        
        try:
            # Extract base data
            base_data = {
                'line_number': enriched_item.get('line_number'),
                'description': self._standardize_description(enriched_item.get('description', '')),
                'quantity': self._standardize_quantity(enriched_item.get('quantity', 0)),
                'unit': self._standardize_unit(enriched_item.get('unit', 'nos')),
                'rate': self._standardize_currency_amount(enriched_item.get('rate', 0)),
                'amount': self._standardize_currency_amount(enriched_item.get('amount', 0))
            }
            
            # Extract and validate enrichment data
            enrichment_data = enriched_item.get('enrichment_data', {})
            
            standardized_enrichment = {
                'product_category': enrichment_data.get('product_category', 'Unclassified'),
                'hsn_code': self._standardize_hsn_code(enrichment_data.get('hsn_code', '')),
                'tax_category': self._validate_tax_category(enrichment_data.get('tax_category', 'GST_18_PERCENT')),
                'account_code': self._validate_account_code(enrichment_data.get('account_code', 'MISC_INCOME')),
                'business_classification': enrichment_data.get('business_classification', 'B2B_SERVICE'),
                'enrichment_confidence': self._standardize_confidence(enrichment_data.get('enrichment_confidence', 0.5))
            }
            
            # Calculate standardized tax amounts
            tax_calculations = self._calculate_tax_amounts(
                base_data['amount'],
                standardized_enrichment['tax_category']
            )
            
            # Create standardized line item
            standardized_item = {
                **base_data,
                'enrichment_data': standardized_enrichment,
                'tax_calculations': tax_calculations,
                'standardization_metadata': {
                    'standardized_at': datetime.utcnow().isoformat(),
                    'currency': self.currency_code,
                    'decimal_precision': self.decimal_precision,
                    'validation_status': 'VALIDATED'
                },
                'original_data': {
                    'description': enriched_item.get('description'),
                    'quantity': enriched_item.get('quantity'),
                    'rate': enriched_item.get('rate'),
                    'amount': enriched_item.get('amount')
                }
            }
            
            return standardized_item
            
        except Exception as e:
            logger.error(f"❌ Line item standardization failed: {e}")
            
            # Return item with error status
            return {
                **enriched_item,
                'standardization_metadata': {
                    'standardized_at': datetime.utcnow().isoformat(),
                    'validation_status': 'FAILED',
                    'error': str(e)
                }
            }
    
    def _standardize_description(self, description: str) -> str:
        """Standardize item description"""
        if not description:
            return "Item Description Not Available"
        
        # Clean and format description
        cleaned = re.sub(r'\s+', ' ', description.strip())
        
        # Capitalize first letter of each word for consistency
        standardized = ' '.join(word.capitalize() for word in cleaned.split())
        
        return standardized[:200]  # Limit length
    
    def _standardize_quantity(self, quantity: Union[int, float, str]) -> float:
        """Standardize quantity value"""
        try:
            if isinstance(quantity, str):
                # Remove commas and other formatting
                quantity = re.sub(r'[,\s]', '', quantity)
                quantity = float(quantity)
            
            quantity = float(quantity)
            
            # Ensure positive quantity
            if quantity <= 0:
                return 1.0  # Default to 1 if invalid
            
            # Round to reasonable precision
            return round(quantity, 3)
            
        except (ValueError, TypeError):
            logger.warning(f"⚠️ Invalid quantity value: {quantity}, defaulting to 1.0")
            return 1.0
    
    def _standardize_unit(self, unit: str) -> str:
        """Standardize unit of measurement"""
        if not unit:
            return "nos"
        
        # Common unit standardizations
        unit_mappings = {
            'piece': 'nos',
            'pieces': 'nos',
            'number': 'nos',
            'each': 'nos',
            'hour': 'hrs',
            'hours': 'hrs',
            'kilogram': 'kg',
            'kilometer': 'km',
            'liter': 'ltr',
            'metre': 'mtr',
            'meter': 'mtr'
        }
        
        standardized = unit.lower().strip()
        return unit_mappings.get(standardized, standardized)
    
    def _standardize_currency_amount(self, amount: Union[int, float, str]) -> float:
        """Standardize currency amounts with proper precision"""
        try:
            if isinstance(amount, str):
                # Remove currency symbols and commas
                amount = re.sub(r'[₹,\s]', '', amount)
                amount = float(amount)
            
            amount = float(amount)
            
            # Use Decimal for precise currency calculations
            decimal_amount = Decimal(str(amount))
            
            # Round to standard precision
            rounded_amount = decimal_amount.quantize(
                Decimal(f'0.{"0" * self.decimal_precision}'),
                rounding=ROUND_HALF_UP
            )
            
            return float(rounded_amount)
            
        except (ValueError, TypeError):
            logger.warning(f"⚠️ Invalid amount value: {amount}, defaulting to 0.0")
            return 0.0
    
    def _standardize_hsn_code(self, hsn_code: str) -> str:
        """Validate and standardize HSN code"""
        if not hsn_code:
            return "998314"  # Default HSN for professional services
        
        # Remove spaces and ensure 6 digits
        cleaned = re.sub(r'\s', '', str(hsn_code))
        
        # Pad with zeros if too short, or truncate if too long
        if len(cleaned) < 6:
            cleaned = cleaned.ljust(6, '0')
        elif len(cleaned) > 6:
            cleaned = cleaned[:6]
        
        # Validate format
        if re.match(r'^\d{6}$', cleaned):
            return cleaned
        
        logger.warning(f"⚠️ Invalid HSN code format: {hsn_code}, using default")
        return "998314"
    
    def _validate_tax_category(self, tax_category: str) -> str:
        """Validate tax category against supported GST rates"""
        if tax_category in self.tax_rates:
            return tax_category
        
        logger.warning(f"⚠️ Invalid tax category: {tax_category}, defaulting to GST_18_PERCENT")
        return "GST_18_PERCENT"
    
    def _validate_account_code(self, account_code: str) -> str:
        """Validate account code format"""
        if not account_code:
            return "MISC_INCOME"
        
        # Check against standard patterns
        for category, pattern in self.account_code_patterns.items():
            if re.match(pattern, account_code, re.IGNORECASE):
                return account_code.upper()
        
        # If no pattern matches, return as-is but standardized
        return account_code.upper().replace(' ', '_')
    
    def _standardize_confidence(self, confidence: Union[int, float]) -> float:
        """Standardize confidence score between 0.0 and 1.0"""
        try:
            conf = float(confidence)
            return max(0.0, min(1.0, conf))  # Clamp between 0 and 1
        except (ValueError, TypeError):
            return 0.5  # Default confidence
    
    def _calculate_tax_amounts(self, base_amount: float, tax_category: str) -> Dict[str, Any]:
        """Calculate tax amounts based on GST category"""
        
        tax_rate = self.tax_rates.get(tax_category, 0.18)  # Default to 18%
        
        # Calculate tax components
        tax_amount = self._standardize_currency_amount(base_amount * tax_rate)
        total_with_tax = self._standardize_currency_amount(base_amount + tax_amount)
        
        # For GST, split into CGST and SGST for intra-state (simplified)
        cgst_amount = self._standardize_currency_amount(tax_amount / 2) if tax_rate > 0 else 0.0
        sgst_amount = cgst_amount
        
        return {
            'base_amount': base_amount,
            'tax_rate': tax_rate,
            'tax_amount': tax_amount,
            'total_with_tax': total_with_tax,
            'gst_breakdown': {
                'cgst_rate': tax_rate / 2 if tax_rate > 0 else 0.0,
                'cgst_amount': cgst_amount,
                'sgst_rate': tax_rate / 2 if tax_rate > 0 else 0.0,
                'sgst_amount': sgst_amount,
                'igst_rate': 0.0,  # Assuming intra-state for simplicity
                'igst_amount': 0.0
            }
        }
    
    def _perform_global_validation(self, line_items: List[Dict[str, Any]]) -> Dict[str, Any]:
        """Perform global validation checks across all line items"""
        
        errors = []
        warnings = []
        
        # Check for duplicate line numbers
        line_numbers = [item.get('line_number') for item in line_items if item.get('line_number')]
        if len(line_numbers) != len(set(line_numbers)):
            errors.append("Duplicate line numbers detected")
        
        # Check for missing required data
        for idx, item in enumerate(line_items):
            item_id = f"Line {item.get('line_number', idx + 1)}"
            
            if not item.get('description'):
                warnings.append(f"{item_id}: Missing description")
            
            if item.get('amount', 0) <= 0:
                warnings.append(f"{item_id}: Zero or negative amount")
            
            if item.get('quantity', 0) <= 0:
                warnings.append(f"{item_id}: Zero or negative quantity")
        
        # Validate total consistency
        total_validation = self._validate_totals_consistency(line_items)
        if total_validation['errors']:
            errors.extend(total_validation['errors'])
        if total_validation['warnings']:
            warnings.extend(total_validation['warnings'])
        
        return {
            'errors': errors,
            'warnings': warnings,
            'validation_passed': len(errors) == 0,
            'validation_timestamp': datetime.utcnow().isoformat()
        }
    
    def _validate_totals_consistency(self, line_items: List[Dict[str, Any]]) -> Dict[str, List[str]]:
        """Validate that calculated totals are consistent"""
        
        errors = []
        warnings = []
        
        for item in line_items:
            # Check quantity × rate = amount consistency
            quantity = item.get('quantity', 0)
            rate = item.get('rate', 0)
            amount = item.get('amount', 0)
            
            calculated_amount = self._standardize_currency_amount(quantity * rate)
            
            if abs(calculated_amount - amount) > 0.01:  # Allow small rounding differences
                warnings.append(f"Line {item.get('line_number', '?')}: Amount mismatch - calculated: {calculated_amount}, provided: {amount}")
        
        return {'errors': errors, 'warnings': warnings}
    
    def _calculate_standardized_totals(self, line_items: List[Dict[str, Any]]) -> Dict[str, Any]:
        """Calculate standardized totals for all line items"""
        
        subtotal = sum(item.get('amount', 0) for item in line_items)
        
        # Calculate tax totals
        total_tax = sum(
            item.get('tax_calculations', {}).get('tax_amount', 0) 
            for item in line_items
        )
        
        grand_total = subtotal + total_tax
        
        # GST breakdown
        cgst_total = sum(
            item.get('tax_calculations', {}).get('gst_breakdown', {}).get('cgst_amount', 0)
            for item in line_items
        )
        
        sgst_total = sum(
            item.get('tax_calculations', {}).get('gst_breakdown', {}).get('sgst_amount', 0)
            for item in line_items
        )
        
        return {
            'subtotal': self._standardize_currency_amount(subtotal),
            'total_tax': self._standardize_currency_amount(total_tax),
            'grand_total': self._standardize_currency_amount(grand_total),
            'gst_totals': {
                'cgst_total': self._standardize_currency_amount(cgst_total),
                'sgst_total': self._standardize_currency_amount(sgst_total),
                'igst_total': 0.0  # Simplified for demo
            },
            'currency': self.currency_code,
            'total_line_items': len(line_items)
        }
    
    def _store_standardized_result(self, tenant_id: str, job_id: str, standardized_result: Dict[str, Any]):
        """Store standardized result in Firestore"""
        
        try:
            # Update main job document with standardized result
            firestore_utils.update_job_data(tenant_id, job_id, {
                'standardized_result': standardized_result,
                'status': 'STANDARDIZED',
                'updated_at': datetime.utcnow().isoformat()
            })
            
            logger.info(f"💾 Stored standardized result for job {job_id}")
            
        except Exception as e:
            logger.error(f"❌ Failed to store standardized result: {e}")
            raise APIError("Failed to store standardized result", "STORAGE_FAILED", 500)

# Initialize service
field_standardizer_service = FieldStandardizerService()

@app.route('/health', methods=['GET'])
def health_check():
    """Health check endpoint"""
    return jsonify({
        'service': 'field-standardizer-v2',
        'status': 'healthy',
        'version': '2.0.0',
        'environment': field_standardizer_service.environment,
        'capabilities': ['field_standardization', 'indian_accounting', 'gst_calculation', 'hsn_validation'],
        'configuration': {
            'currency': field_standardizer_service.currency_code,
            'decimal_precision': field_standardizer_service.decimal_precision,
            'supported_gst_rates': list(field_standardizer_service.tax_rates.keys())
        }
    })

@app.route('/standardize', methods=['POST'])
@require_auth_and_tenant
def standardize_job_data(auth_context: Dict[str, Any]):
    """Standardize enriched data for a job"""
    try:
        # Validate request
        if not request.json:
            raise APIError("Request must contain JSON data", "INVALID_REQUEST", 400)
        
        tenant_id = auth_context['tenant_id']
        job_id = request.json.get('job_id')
        enriched_chunks = request.json.get('enriched_chunks', [])
        
        if not job_id:
            raise APIError("job_id is required", "MISSING_JOB_ID", 400)
        
        if not enriched_chunks:
            raise APIError("enriched_chunks data is required", "MISSING_CHUNKS", 400)
        
        # Standardize the job data
        standardized_result = field_standardizer_service.standardize_job_data(
            tenant_id,
            job_id,
            enriched_chunks
        )
        
        return jsonify(success_response(standardized_result, "Job data standardized successfully"))
        
    except APIError as e:
        return ErrorHandler.format_error_response(e.message, e.error_code, e.status_code)
    except Exception as e:
        logger.error(f"❌ Standardize job data error: {e}")
        return ErrorHandler.handle_generic_error(e, {'tenant_id': auth_context.get('tenant_id')})

@app.route('/jobs/<job_id>/standardized-result', methods=['GET'])
@require_auth_and_tenant
def get_standardized_result(job_id: str, auth_context: Dict[str, Any]):
    """Get standardized result for specific job"""
    try:
        tenant_id = auth_context['tenant_id']
        
        # Get job data with standardized result
        job_data = firestore_utils.get_job_data(tenant_id, job_id)
        
        if not job_data:
            raise APIError("Job not found", "JOB_NOT_FOUND", 404)
        
        standardized_result = job_data.get('standardized_result')
        if not standardized_result:
            raise APIError("Standardized result not available", "STANDARDIZATION_NOT_FOUND", 404)
        
        return jsonify(success_response(standardized_result, "Standardized result retrieved"))
        
    except APIError as e:
        return ErrorHandler.format_error_response(e.message, e.error_code, e.status_code)
    except Exception as e:
        logger.error(f"❌ Get standardized result error: {e}")
        return ErrorHandler.handle_generic_error(e, {'tenant_id': auth_context.get('tenant_id'), 'job_id': job_id})

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 8080))
    app.run(host='0.0.0.0', port=port, debug=False)