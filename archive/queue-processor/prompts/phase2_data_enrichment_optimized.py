# Phase 2: Optimized Business Enrichment (70% token reduction)

PHASE2_DATA_ENRICHMENT_PROMPT = """Enrich invoice data with HSN codes and business categorization.

BUSINESS CATEGORIES (based on org context):
- IT/Software: computers→office equipment, software→tech expenses, internet→operational
- Manufacturing: raw materials→direct cost, equipment→capital, utilities→overhead  
- Retail: inventory→trading stock, fixtures→shop equipment, delivery→transport
- Services: office equipment→indirect, books→professional dev, client expenses→direct

HSN CODES: office supplies(48239090), computers(84713000), software(998313), furniture(94036000), telecom(85176290), travel(996411), food(210690)

CLASSIFICATION RULES:
- CAPITAL_ASSET: >1year use, significant value, business capacity enhancement
- REVENUE_EXPENSE: day-to-day operations, consumed <1year
- DIRECT COST: directly relates to products/services sold
- INDIRECT COST: general business operations

OUTPUT: Add hsn_code, cost_type(DIRECT/INDIRECT/TRANSPORT/OVERHEAD), organization_account_name, business_classification(CAPITAL_ASSET/REVENUE_EXPENSE/COST_OF_GOODS/OPERATIONAL_OVERHEAD) to each item. Create balanced journal entries with account_name, account_type(Asset/Expense/Liability), debit_amount, credit_amount.

Return ONLY enriched JSON with all fields populated."""