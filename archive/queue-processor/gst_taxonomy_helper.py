"""
GST Taxonomy Helper for HSN Code Classification
Maps item descriptions to appropriate HSN codes based on official GST commodity classification
"""

class GSTTaxonomyHelper:
    """Helper class for GST-based HSN code classification and business categorization"""
    
    # GST Sections and their primary HSN ranges
    GST_SECTIONS = {
        'animals_products': {
            'name': 'Section I: Animals and Animal Products',
            'chapters': list(range(1, 6)),
            'hsn_prefix': ['01', '02', '03', '04', '05'],
            'keywords': ['meat', 'fish', 'dairy', 'milk', 'eggs', 'honey', 'leather', 'animal']
        },
        'vegetable_products': {
            'name': 'Section II: Vegetables and Vegetable Products',
            'chapters': list(range(6, 15)),
            'hsn_prefix': ['06', '07', '08', '09', '10', '11', '12', '13', '14'],
            'keywords': ['vegetables', 'fruits', 'cereals', 'grains', 'spices', 'tea', 'coffee', 'plants']
        },
        'oils_fats': {
            'name': 'Section III: Animal or Vegetable Oils and Fats',
            'chapters': [15],
            'hsn_prefix': ['15'],
            'keywords': ['oil', 'butter', 'ghee', 'fats', 'margarine']
        },
        'food_beverages': {
            'name': 'Section IV: Prepared Food, Beverages, Spirits',
            'chapters': list(range(16, 25)),
            'hsn_prefix': ['16', '17', '18', '19', '20', '21', '22', '23', '24'],
            'keywords': ['food', 'beverages', 'sugar', 'chocolate', 'bread', 'alcohol', 'tobacco']
        },
        'minerals': {
            'name': 'Section V: Minerals',
            'chapters': list(range(25, 28)),
            'hsn_prefix': ['25', '26', '27'],
            'keywords': ['minerals', 'ores', 'coal', 'petroleum', 'fuel', 'oil', 'gas']
        },
        'chemicals': {
            'name': 'Section VI: Chemical Products',
            'chapters': list(range(28, 39)),
            'hsn_prefix': ['28', '29', '30', '31', '32', '33', '34', '35', '36', '37', '38'],
            'keywords': ['chemical', 'pharmaceutical', 'medicine', 'fertilizer', 'paint', 'cosmetic', 'soap']
        },
        'plastics_rubber': {
            'name': 'Section VII: Plastics and Rubber',
            'chapters': [39, 40],
            'hsn_prefix': ['39', '40'],
            'keywords': ['plastic', 'rubber', 'polymer', 'synthetic']
        },
        'leather_goods': {
            'name': 'Section VIII: Raw Hides, Skins, Leather',
            'chapters': list(range(41, 44)),
            'hsn_prefix': ['41', '42', '43'],
            'keywords': ['leather', 'hides', 'skins', 'fur', 'bags', 'suitcase']
        },
        'wood_products': {
            'name': 'Section IX: Wood and Wooden Articles',
            'chapters': list(range(44, 47)),
            'hsn_prefix': ['44', '45', '46'],
            'keywords': ['wood', 'timber', 'cork', 'basket', 'furniture']
        },
        'paper_products': {
            'name': 'Section X: Paper and Paperboard',
            'chapters': list(range(47, 50)),
            'hsn_prefix': ['47', '48', '49'],
            'keywords': ['paper', 'cardboard', 'books', 'newspapers', 'printing']
        },
        'textiles': {
            'name': 'Section XI: Textiles and Textile Articles',
            'chapters': list(range(50, 64)),
            'hsn_prefix': ['50', '51', '52', '53', '54', '55', '56', '57', '58', '59', '60', '61', '62', '63'],
            'keywords': ['textile', 'fabric', 'clothing', 'garments', 'cotton', 'silk', 'wool']
        },
        'footwear_accessories': {
            'name': 'Section XII: Footwear, Headgear, Umbrellas',
            'chapters': list(range(64, 68)),
            'hsn_prefix': ['64', '65', '66', '67'],
            'keywords': ['shoes', 'footwear', 'hats', 'umbrella', 'walking stick']
        },
        'stone_glass_ceramic': {
            'name': 'Section XIII: Stone, Plaster, Glass, Ceramic',
            'chapters': list(range(68, 71)),
            'hsn_prefix': ['68', '69', '70'],
            'keywords': ['stone', 'cement', 'glass', 'ceramic', 'pottery']
        },
        'precious_metals': {
            'name': 'Section XIV: Precious Metals and Stones',
            'chapters': [71],
            'hsn_prefix': ['71'],
            'keywords': ['gold', 'silver', 'diamond', 'jewelry', 'precious']
        },
        'base_metals': {
            'name': 'Section XV: Base Metals and Articles',
            'chapters': list(range(72, 84)),
            'hsn_prefix': ['72', '73', '74', '75', '76', '78', '79', '80', '81', '82', '83'],
            'keywords': ['iron', 'steel', 'copper', 'aluminum', 'metal', 'tools']
        },
        'machinery_electrical': {
            'name': 'Section XVI: Machinery and Electrical Equipment',
            'chapters': [84, 85],
            'hsn_prefix': ['84', '85'],
            'keywords': ['machinery', 'computer', 'electrical', 'electronics', 'equipment']
        },
        'vehicles_transport': {
            'name': 'Section XVII: Vehicles and Transport',
            'chapters': list(range(86, 90)),
            'hsn_prefix': ['86', '87', '88', '89'],
            'keywords': ['vehicle', 'car', 'truck', 'aircraft', 'ship', 'boat']
        },
        'precision_instruments': {
            'name': 'Section XVIII: Precision Instruments',
            'chapters': list(range(90, 93)),
            'hsn_prefix': ['90', '91', '92'],
            'keywords': ['instrument', 'optical', 'medical', 'watch', 'clock', 'musical']
        },
        'arms_ammunition': {
            'name': 'Section XIX: Arms and Ammunition',
            'chapters': [93],
            'hsn_prefix': ['93'],
            'keywords': ['arms', 'weapons', 'ammunition']
        },
        'miscellaneous': {
            'name': 'Section XX: Miscellaneous Manufactured Articles',
            'chapters': list(range(94, 97)),
            'hsn_prefix': ['94', '95', '96'],
            'keywords': ['furniture', 'toys', 'games', 'miscellaneous']
        },
        'services': {
            'name': 'Section XXI: Services',
            'chapters': [99],
            'hsn_prefix': ['99'],
            'keywords': ['service', 'consulting', 'professional', 'maintenance', 'repair']
        }
    }
    
    # Common HSN codes for frequently used items
    COMMON_HSN_CODES = {
        # IT & Technology
        'computer': '84713000',
        'laptop': '84713000', 
        'software': '998313',
        'mobile': '85171200',
        'printer': '84433200',
        'modem': '85176290',
        'router': '85176290',
        'internet': '998313',
        
        # Office Supplies
        'paper': '48239090',
        'stationery': '48239090',
        'pen': '96081000',
        'pencil': '96091000',
        'notebook': '48201000',
        
        # Food & Beverages
        'water': '22011000',
        'tea': '09021000',
        'coffee': '09011100',
        'snacks': '19059090',
        'biscuits': '19053100',
        
        # Pharmaceuticals
        'medicine': '30041000',
        'tablet': '30041000',
        'injection': '30021000',
        
        # Fuel & Energy
        'petrol': '27101221',
        'diesel': '27101942',
        'electricity': '997111',
        
        # Professional Services  
        'legal': '998721',
        'audit': '998313',
        'consulting': '998313',
        'accounting': '998313',
        
        # Transport & Logistics
        'freight': '996511',
        'courier': '996411',
        'taxi': '996512',
        
        # Construction
        'cement': '25232900',
        'steel': '72142000',
        'paint': '32100000',
        
        # Default/General
        'general': '48239090'
    }
    
    @classmethod
    def get_hsn_code(cls, item_description: str, business_type: str = None) -> str:
        """
        Get appropriate HSN code based on item description and business type
        """
        if not item_description:
            return '48239090'  # Default general HSN
            
        item_lower = item_description.lower()
        
        # Check direct matches first
        for keyword, hsn in cls.COMMON_HSN_CODES.items():
            if keyword in item_lower:
                return hsn
        
        # Check section-based classification
        for section_key, section_data in cls.GST_SECTIONS.items():
            for keyword in section_data['keywords']:
                if keyword in item_lower:
                    # Return a representative HSN from that section
                    prefix = section_data['hsn_prefix'][0]
                    return f"{prefix}239090"  # Generic code for the section
        
        # Business type specific defaults
        business_defaults = {
            'software_it': '998313',
            'manufacturing': '84799090', 
            'retail_trading': '48239090',
            'professional_services': '998721',
            'restaurant_food': '21069030',
            'healthcare': '90189099',
            'construction': '25232900'
        }
        
        return business_defaults.get(business_type, '48239090')
    
    @classmethod
    def get_expense_category(cls, hsn_code: str, business_type: str = None) -> str:
        """
        Get appropriate expense category based on HSN code and business type
        """
        if not hsn_code:
            return 'Office Expenses'
        
        # HSN-based categorization
        prefix = hsn_code[:2]
        
        category_mapping = {
            # Food & Agriculture (01-24)
            **{f"{i:02d}": 'Raw Materials' for i in range(1, 25)},
            
            # Minerals & Fuels (25-27)
            '25': 'Raw Materials', '26': 'Raw Materials', '27': 'Fuel & Energy',
            
            # Chemicals & Pharmaceuticals (28-38)
            **{f"{i:02d}": 'Raw Materials' for i in range(28, 39)},
            '30': 'Medical Expenses',
            '33': 'Office Supplies',
            
            # Plastics & Rubber (39-40)
            '39': 'Raw Materials', '40': 'Raw Materials',
            
            # Paper & Printing (47-49)
            '48': 'Office Supplies', '49': 'Office Supplies',
            
            # Textiles (50-63)
            **{f"{i:02d}": 'Raw Materials' for i in range(50, 64)},
            
            # Metals (72-83)
            **{f"{i:02d}": 'Raw Materials' for i in range(72, 84)},
            '82': 'Equipment',
            
            # Machinery & Electrical (84-85)
            '84': 'Equipment', '85': 'Equipment',
            
            # Vehicles (86-89)
            **{f"{i:02d}": 'Vehicle & Transport' for i in range(86, 90)},
            
            # Instruments (90-92)
            '90': 'Equipment', '91': 'Equipment', '92': 'Equipment',
            
            # Furniture & Miscellaneous (94-96)
            '94': 'Furniture & Fixtures', '95': 'Office Supplies', '96': 'Office Supplies',
            
            # Services (99)
            '99': 'Professional Services'
        }
        
        return category_mapping.get(prefix, 'Office Expenses')
    
    @classmethod
    def get_gst_section_info(cls, hsn_code: str) -> dict:
        """
        Get GST section information for a given HSN code
        """
        if not hsn_code or len(hsn_code) < 2:
            return {'section': 'Unknown', 'chapter': 0}
        
        prefix = hsn_code[:2]
        
        for section_key, section_data in cls.GST_SECTIONS.items():
            if prefix in section_data['hsn_prefix']:
                return {
                    'section': section_data['name'],
                    'chapter': int(prefix) if prefix.isdigit() else 0,
                    'keywords': section_data['keywords']
                }
        
        return {'section': 'Unknown', 'chapter': 0}