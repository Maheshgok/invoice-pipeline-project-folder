from typing import Dict, Any, List, Union, Optional
from dataclasses import dataclass
from datetime import datetime
import re

@dataclass
class ValidationError:
    field: str
    message: str

class InvoiceDataValidator:
    """Validates the structure and content of extracted invoice data."""

    @staticmethod
    def validate_amount(amount: Union[str, float, int]) -> Optional[ValidationError]:
        """Validate an amount value."""
        try:
            if isinstance(amount, str):
                # Remove currency symbols and commas
                cleaned = re.sub(r'[₹$,]', '', amount)
                float(cleaned)
            elif isinstance(amount, (int, float)):
                float(amount)
            else:
                return ValidationError("amount", "Amount must be a number or string representing a number")
            return None
        except ValueError:
            return ValidationError("amount", f"Invalid amount format: {amount}")

    @staticmethod
    def validate_date(date_str: str) -> Optional[ValidationError]:
        """Validate a date string."""
        date_formats = ["%Y-%m-%d", "%d/%m/%Y", "%d-%m-%Y"]
        for fmt in date_formats:
            try:
                datetime.strptime(date_str, fmt)
                return None
            except ValueError:
                continue
        return ValidationError("date", f"Invalid date format: {date_str}")

    @staticmethod
    def validate_invoice_details(details: Dict[str, Any]) -> List[ValidationError]:
        """Validate invoice details structure."""
        errors = []
        required_fields = {
            "number": str,
            "date": str,
            "buyer": dict,
            "seller": dict,
            "line_items": list,
            "totals": dict,
            "taxes": dict
        }

        # Check required fields and types
        for field, expected_type in required_fields.items():
            if field not in details:
                errors.append(ValidationError(field, f"Missing required field: {field}"))
            elif not isinstance(details[field], expected_type):
                errors.append(ValidationError(field, f"Invalid type for {field}"))

        # Validate date if present
        if "date" in details and isinstance(details["date"], str):
            date_error = InvoiceDataValidator.validate_date(details["date"])
            if date_error:
                errors.append(date_error)

        # Validate amounts in totals
        if "totals" in details and isinstance(details["totals"], dict):
            for key, value in details["totals"].items():
                amount_error = InvoiceDataValidator.validate_amount(value)
                if amount_error:
                    errors.append(ValidationError(f"totals.{key}", amount_error.message))

        return errors

    @staticmethod
    def validate_journal_entry(entry: Dict[str, Any]) -> List[ValidationError]:
        """Validate a single journal entry."""
        errors = []
        required_fields = {
            "DebitAccount": str,
            "CreditAccount": str,
            "Amount": (float, int, str),
            "Narration": str
        }

        for field, expected_type in required_fields.items():
            if field not in entry:
                errors.append(ValidationError(field, f"Missing required field: {field}"))
            elif not isinstance(entry[field], expected_type):
                errors.append(ValidationError(field, f"Invalid type for {field}"))

            if field == "Amount":
                amount_error = InvoiceDataValidator.validate_amount(entry[field])
                if amount_error:
                    errors.append(amount_error)

        return errors

    @staticmethod
    def validate_journal_entries(entries: List[Dict[str, Any]]) -> List[ValidationError]:
        """Validate all journal entries."""
        errors = []
        
        if not entries:
            errors.append(ValidationError("journal_entries", "No journal entries provided"))
            return errors

        for i, entry in enumerate(entries):
            entry_errors = InvoiceDataValidator.validate_journal_entry(entry)
            for error in entry_errors:
                errors.append(ValidationError(f"entry_{i}.{error.field}", error.message))

        return errors

    @staticmethod
    def validate_extracted_data(data: Dict[str, Any]) -> List[ValidationError]:
        """
        Validate the complete extracted data structure.
        
        Args:
            data: The complete extracted data dictionary
            
        Returns:
            List of validation errors, empty if validation passed
        """
        errors = []

        # Check required top-level sections
        if "InvoiceDetails" not in data:
            errors.append(ValidationError("structure", "Missing InvoiceDetails section"))
        if "SuggestedJournalEntries" not in data:
            errors.append(ValidationError("structure", "Missing SuggestedJournalEntries section"))

        # Validate invoice details
        if "InvoiceDetails" in data:
            errors.extend(InvoiceDataValidator.validate_invoice_details(data["InvoiceDetails"]))

        # Validate journal entries
        if "SuggestedJournalEntries" in data:
            if not isinstance(data["SuggestedJournalEntries"], list):
                errors.append(ValidationError("journal_entries", "SuggestedJournalEntries must be an array"))
            else:
                errors.extend(InvoiceDataValidator.validate_journal_entries(data["SuggestedJournalEntries"]))

        return errors