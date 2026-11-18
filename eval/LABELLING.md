# How the gold labels were chosen

Every `raw` string in `categories.gold.jsonl` is a real `brandedFoodCategory` value from the USDA
snapshots. Each was labelled by hand with the aisle a shopper would walk to, using these rules:

- Anything sold frozen goes to **Frozen** (including ice cream and frozen pancakes).
- Shelf-stable cans and jars (vegetables, fruit, beans, soup, tuna, pickles, olives) go to **Canned & Jarred**.
- Sweet baked goods, including packaged cookies, go to **Bakery**. Crackers, chips, nuts and bars go to **Snacks**.
- Ready-to-eat chilled food (cold cuts, sandwiches, sushi, deli salads) goes to **Deli & Prepared**. Raw or cooking meat goes to **Meat & Seafood**.
- Baking ingredients (flour, sugar, cake mixes, decorations, gelatin) go to **Baking**. Oils, spices, rice, honey, syrups, jams and nut butters go to **Pantry Staples**.
- Dairy and its substitutes (plant milk, margarine) go to **Dairy & Eggs**. Tofu goes to **Produce** (it is sold in the chilled produce section in most US stores).
- Cuisine-specific sauces and dinner kits go to **International**. Non-food items with no aisle go to **Other**.

Several rows are deliberately ambiguous (for example nut butters, cereal bars, cold cuts). These are the cases where rules usually fail.
