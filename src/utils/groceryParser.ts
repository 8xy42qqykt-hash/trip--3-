export interface ParsedGrocery {
  text: string;
  quantity?: string | null;
  category: string;
}

const CATEGORY_KEYWORDS: Record<string, string[]> = {
  Produce: [
    'pear', 'pears', 'banana', 'bananas', 'orange', 'oranges', 'lemon', 'lemons',
    'lime', 'limes', 'potato', 'potatoes', 'onion', 'onions', 'garlic', 'tomato',
    'tomatoes', 'avocado', 'avocados', 'lettuce', 'salad', 'spinach', 'cucumber',
    'cucumbers', 'carrot', 'carrots', 'pepper', 'peppers', 'berry', 'berries',
    'strawberry', 'blueberry', 'herb', 'basil', 'cilantro', 'ginger', 'mushroom',
    'broccoli', 'zucchini', 'fruit', 'vegetable', 'veg'
  ],
  Dairy: [
    'milk', 'oat milk', 'almond milk', 'soy milk', 'cheese', 'parmesan', 'cheddar',
    'mozzarella', 'feta', 'butter', 'yogurt', 'yoghurt', 'cream', 'sour cream',
    'eggs', 'egg'
  ],
  Bakery: [
    'bread', 'bagel', 'bagels', 'buns', 'croissant', 'croissants', 'toast',
    'baguette', 'tortilla', 'tortillas', 'pita', 'muffin', 'pastry'
  ],
  Meat: [
    'chicken', 'beef', 'pork', 'bacon', 'ham', 'sausage', 'sausages', 'steak',
    'salmon', 'tuna', 'fish', 'turkey', 'shrimp', 'meat', 'mince'
  ],
  Drinks: [
    'water', 'juice', 'soda', 'coke', 'beer', 'wine', 'coffee', 'tea', 'tonic',
    'cider', 'sparkling', 'seltzer', 'gin', 'vodka', 'rum', 'whiskey', 'prosecco'
  ],
  Pantry: [
    'pasta', 'rice', 'noodles', 'sauce', 'olive oil', 'oil', 'salt', 'pepper',
    'sugar', 'flour', 'spices', 'beans', 'lentils', 'cereal', 'oats', 'honey',
    'mayo', 'mayonnaise', 'mustard', 'ketchup', 'soy sauce', 'vinegar', 'curry'
  ],
  Snacks: [
    'chips', 'crisps', 'chocolate', 'cookies', 'biscuits', 'nuts', 'popcorn',
    'candy', 'cracker', 'crackers', 'pretzels', 'granola'
  ],
  Household: [
    'soap', 'shampoo', 'toilet paper', 'paper towel', 'sponge', 'sponges',
    'trash bags', 'garbage bags', 'detergent', 'foil', 'sunscreen', 'napkins'
  ]
};

export function parseGroceryInput(rawInput: string): ParsedGrocery {
  const trimmed = rawInput.trim();
  if (!trimmed) {
    return { text: '', category: 'Other' };
  }

  let text = trimmed;
  let quantity: string | null = null;

  const trailingXMatch = text.match(/\s+x\s*(\d+(?:[.,]\d+)?\s*(?:kg|g|l|ml|pack|cans|bottles)?)$/i);
  if (trailingXMatch) {
    quantity = trailingXMatch[1];
    text = text.replace(trailingXMatch[0], '').trim();
  }

  if (!quantity) {
    const trailingUnitMatch = text.match(/\s+(\d+(?:[.,]\d+)?\s*(?:kg|g|l|ml|pack|cans|bottles|boxes|bars))$/i);
    if (trailingUnitMatch) {
      quantity = trailingUnitMatch[1];
      text = text.replace(trailingUnitMatch[0], '').trim();
    }
  }

  if (!quantity) {
    const leadingMatch = text.match(/^(\d+(?:[.,]\d+)?\s*(?:x|kg|g|l|ml|pack|cans|bottles|boxes)?)\s+(.+)$/i);
    if (leadingMatch) {
      quantity = leadingMatch[1].replace(/x$/i, '').trim();
      text = leadingMatch[2].trim();
    }
  }

  const lowerText = text.toLowerCase();
  let matchedCategory = 'Other';
  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    for (const kw of keywords) {
      const regex = new RegExp(`\\b${kw}\\b`, 'i');
      if (regex.test(lowerText)) {
        matchedCategory = category;
        break;
      }
    }
    if (matchedCategory !== 'Other') break;
  }

  return {
    text: text.charAt(0).toUpperCase() + text.slice(1),
    quantity,
    category: matchedCategory
  };
}
