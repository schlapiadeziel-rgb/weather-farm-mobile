import type { AnimalDefinition, CropDefinition, ItemDefinition, ItemId, MachineDefinition, MachineId, RecipeDefinition } from './farmTypes';

/**
 * Original content and accelerated balancing for this independent prototype.
 * Prices, levels, yields, durations and legacy weather ranges are game values,
 * not Hay Day's exact live database, real crop models or feeding guidance.
 * Registering an item does not mean its source or multiplayer system exists.
 */
const minute = (value: number): number => Math.round(value * 60_000);

export const CROPS: readonly CropDefinition[] = [
  { id: 'wheat', name: '小麦', emoji: '🌾', cost: 4, value: 8, days: 2, durationMs: minute(1), level: 1, xp: 2, minTemp: 8, maxTemp: 28, minMoisture: 25, maxMoisture: 80 },
  { id: 'corn', name: '玉米', emoji: '🌽', cost: 7, value: 14, days: 3, durationMs: minute(2), level: 1, xp: 3, minTemp: 12, maxTemp: 32, minMoisture: 30, maxMoisture: 80 },
  { id: 'carrot', name: '胡萝卜', emoji: '🥕', cost: 9, value: 18, days: 3, durationMs: minute(3), level: 2, xp: 4, minTemp: 8, maxTemp: 26, minMoisture: 30, maxMoisture: 78 },
  { id: 'soybean', name: '大豆', emoji: '🫘', cost: 11, value: 22, days: 4, durationMs: minute(4), level: 1, xp: 5, minTemp: 12, maxTemp: 30, minMoisture: 30, maxMoisture: 82 },
  { id: 'sugarcane', name: '甘蔗', emoji: '🎋', cost: 14, value: 28, days: 5, durationMs: minute(5), level: 3, xp: 6, minTemp: 18, maxTemp: 34, minMoisture: 38, maxMoisture: 85 },
  { id: 'indigo', name: '蓝靛', emoji: '🪻', cost: 17, value: 34, days: 5, durationMs: minute(6), level: 5, xp: 7, minTemp: 12, maxTemp: 30, minMoisture: 30, maxMoisture: 78 },
  { id: 'pumpkin', name: '南瓜', emoji: '🎃', cost: 22, value: 44, days: 6, durationMs: minute(8), level: 6, xp: 9, minTemp: 12, maxTemp: 30, minMoisture: 32, maxMoisture: 80 },
  { id: 'cotton', name: '棉花', emoji: '☁️', cost: 26, value: 52, days: 6, durationMs: minute(10), level: 8, xp: 10, minTemp: 15, maxTemp: 32, minMoisture: 28, maxMoisture: 78 },
  { id: 'tomato', name: '番茄', emoji: '🍅', cost: 30, value: 60, days: 5, durationMs: minute(12), level: 7, xp: 11, minTemp: 18, maxTemp: 30, minMoisture: 35, maxMoisture: 82 },
  { id: 'potato', name: '土豆', emoji: '🥔', cost: 34, value: 68, days: 5, durationMs: minute(15), level: 9, xp: 12, minTemp: 8, maxTemp: 26, minMoisture: 30, maxMoisture: 80 },
  { id: 'strawberry', name: '草莓', emoji: '🍓', cost: 45, value: 90, days: 6, durationMs: minute(20), level: 11, xp: 16, minTemp: 12, maxTemp: 26, minMoisture: 35, maxMoisture: 80 },
  { id: 'radish', name: '萝卜', emoji: '🌱', cost: 6, value: 12, days: 3, durationMs: minute(1.5), level: 1, xp: 3, minTemp: 10, maxTemp: 27, minMoisture: 30, maxMoisture: 80 },
];

export const LIVESTOCK: readonly AnimalDefinition[] = [
  { id: 'chicken', name: '鸡', emoji: '🐔', cost: 90, level: 1, product: 'egg', productName: '鸡蛋', productEmoji: '🥚', productValue: 18, productionDays: 2, durationMs: minute(2), feedItem: 'chicken_feed', feedCost: 12, minTemp: 12, maxTemp: 30 },
  { id: 'cow', name: '奶牛', emoji: '🐄', cost: 180, level: 3, product: 'milk', productName: '牛奶', productEmoji: '🥛', productValue: 30, productionDays: 3, durationMs: minute(4), feedItem: 'cow_feed', feedCost: 18, minTemp: 5, maxTemp: 28 },
  { id: 'pig', name: '猪', emoji: '🐷', cost: 260, level: 5, product: 'bacon', productName: '培根', productEmoji: '🥓', productValue: 48, productionDays: 4, durationMs: minute(6), feedItem: 'pig_feed', feedCost: 24, minTemp: 10, maxTemp: 30 },
  { id: 'sheep', name: '绵羊', emoji: '🐑', cost: 320, level: 7, product: 'wool', productName: '羊毛', productEmoji: '🧶', productValue: 55, productionDays: 4, durationMs: minute(8), feedItem: 'sheep_feed', feedCost: 28, minTemp: 5, maxTemp: 28 },
  { id: 'goat', name: '山羊', emoji: '🐐', cost: 400, level: 10, product: 'goat_milk', productName: '羊奶', productEmoji: '🥛', productValue: 65, productionDays: 4, durationMs: minute(10), feedItem: 'goat_feed', feedCost: 34, minTemp: 8, maxTemp: 30 },
];

export const MACHINES: readonly MachineDefinition[] = [
  { id: 'feed_mill', name: '饲料坊', level: 1, cost: 60 },
  { id: 'bakery', name: '面包坊', level: 1, cost: 90 },
  { id: 'dairy', name: '乳品坊', level: 3, cost: 180 },
  { id: 'sugar_mill', name: '制糖坊', level: 3, cost: 220 },
  { id: 'popcorn_pot', name: '爆米花锅', level: 4, cost: 260 },
  { id: 'bbq', name: '烧烤架', level: 5, cost: 320 },
  { id: 'pie_oven', name: '馅饼炉', level: 6, cost: 380 },
  { id: 'loom', name: '织布机', level: 8, cost: 480 },
  { id: 'sewing_machine', name: '缝纫间', level: 9, cost: 560 },
  { id: 'cake_oven', name: '蛋糕房', level: 10, cost: 640 },
  { id: 'juice_press', name: '榨汁坊', level: 11, cost: 720 },
  { id: 'icecream_maker', name: '冰淇淋机', level: 12, cost: 800 },
  { id: 'jam_maker', name: '果酱锅', level: 13, cost: 900 },
  { id: 'smelter', name: '冶炼炉', level: 14, cost: 1000 },
  { id: 'jeweler', name: '首饰工坊', level: 16, cost: 1200 },
  { id: 'coffee_kiosk', name: '咖啡亭', level: 18, cost: 1400 },
  { id: 'honey_extractor', name: '蜂产品工坊', level: 15, cost: 1100 },
  { id: 'candy_machine', name: '糖果坊', level: 19, cost: 1500 },
  { id: 'sauce_maker', name: '酱料坊', level: 20, cost: 1600 },
  { id: 'sushi_bar', name: '寿司铺', level: 21, cost: 1750 },
  { id: 'salad_bar', name: '沙拉铺', level: 22, cost: 1900 },
  { id: 'soup_kitchen', name: '汤品厨房', level: 23, cost: 2050 },
];

type ItemRow = readonly [ItemId, string, string, number, number];
const feedRows: readonly ItemRow[] = [
  ['chicken_feed', '鸡饲料', '🌾', 12, 1], ['cow_feed', '奶牛饲料', '🌿', 18, 3],
  ['pig_feed', '猪饲料', '🫘', 24, 5], ['sheep_feed', '绵羊饲料', '🌱', 28, 7],
  ['goat_feed', '山羊饲料', '🌿', 34, 10],
];
const productRows: readonly ItemRow[] = [
  ['bread', '面包', '🍞', 34, 1], ['corn_bread', '玉米面包', '🍞', 48, 2],
  ['cookie', '曲奇', '🍪', 76, 4], ['pancake', '煎饼', '🥞', 62, 3],
  ['cream', '奶油', '🥛', 48, 3], ['butter', '黄油', '🧈', 78, 4],
  ['cheese', '奶酪', '🧀', 115, 5], ['goat_cheese', '羊奶酪', '🧀', 155, 10],
  ['brown_sugar', '红糖', '🟫', 48, 3], ['white_sugar', '白糖', '⬜', 70, 4],
  ['syrup', '糖浆', '🍯', 98, 5], ['popcorn', '爆米花', '🍿', 46, 4],
  ['buttered_popcorn', '黄油爆米花', '🍿', 130, 6],
  ['bacon_eggs', '培根煎蛋', '🍳', 110, 5], ['roasted_tomatoes', '烤番茄', '🍅', 140, 7],
  ['carrot_pie', '胡萝卜馅饼', '🥧', 130, 6], ['pumpkin_pie', '南瓜馅饼', '🥧', 185, 6],
  ['bacon_pie', '培根馅饼', '🥧', 175, 7], ['apple_pie', '苹果馅饼', '🥧', 210, 8],
  ['cotton_fabric', '棉布', '🧵', 135, 8], ['wool_sweater', '羊毛衫', '🧥', 170, 9],
  ['cotton_shirt', '棉衬衫', '👕', 290, 9], ['cream_cake', '奶油蛋糕', '🎂', 220, 10],
  ['carrot_cake', '胡萝卜蛋糕', '🍰', 205, 10], ['berry_cake', '浆果蛋糕', '🍰', 300, 11],
  ['carrot_juice', '胡萝卜汁', '🥤', 88, 11], ['tomato_juice', '番茄汁', '🥤', 145, 11],
  ['apple_juice', '苹果汁', '🧃', 160, 11], ['cherry_juice', '樱桃汁', '🧃', 180, 11],
  ['berry_jam', '浆果酱', '🫙', 240, 13], ['apple_jam', '苹果酱', '🫙', 225, 13],
  ['cherry_jam', '樱桃酱', '🫙', 255, 13], ['ice_cream', '原味冰淇淋', '🍦', 170, 12],
  ['strawberry_icecream', '草莓冰淇淋', '🍨', 280, 12], ['cherry_popsicle', '樱桃冰棒', '🍡', 195, 12],
  ['beeswax', '蜂蜡', '🕯️', 170, 15], ['iron_bar', '铁锭', '🔩', 150, 14],
  ['gold_bar', '金锭', '🟨', 220, 15], ['bracelet', '手镯', '💍', 510, 16],
  ['necklace', '项链', '📿', 560, 16], ['espresso', '浓缩咖啡', '☕', 145, 18],
  ['latte', '拿铁', '☕', 195, 18], ['hot_chocolate', '热巧克力', '🍫', 260, 18],
  ['toffee', '太妃糖', '🍬', 245, 19], ['chocolate', '巧克力', '🍫', 315, 19],
  ['soy_sauce', '酱油', '🫙', 165, 20], ['tomato_sauce', '番茄酱', '🫙', 205, 20],
  ['fish_sushi', '鱼寿司', '🍣', 230, 21], ['vegetable_sushi', '蔬菜卷', '🍙', 135, 21],
  ['green_salad', '田园沙拉', '🥗', 195, 22], ['tomato_soup', '番茄汤', '🥣', 185, 23],
  ['fish_soup', '鲜鱼汤', '🍲', 240, 23],
];
const fruitRows: readonly ItemRow[] = [
  ['apple', '苹果', '🍎', 48, 6], ['cherry', '樱桃', '🍒', 56, 8],
  ['raspberry', '树莓', '🫐', 58, 8], ['blackberry', '黑莓', '🫐', 65, 11],
  ['cacao', '可可果', '🟤', 78, 16], ['coffee_bean', '咖啡豆', '🫘', 62, 18],
];
const materialRows: readonly ItemRow[] = [
  ['coal', '煤', '⚫', 22, 14], ['iron_ore', '铁矿石', '🪨', 38, 14], ['gold_ore', '金矿石', '✨', 60, 15],
  ['plank', '木板', '🪵', 45, 1], ['screw', '螺钉', '🔩', 45, 1], ['bolt', '螺栓', '🔩', 45, 1],
  ['duct_tape', '胶带', '🩹', 45, 1], ['nail', '钉子', '📌', 45, 1], ['wood_panel', '木材板', '🪵', 45, 1],
  ['saw', '锯子', '🪚', 36, 6], ['axe', '斧头', '🪓', 32, 6],
  ['shovel', '铲子', '🛠️', 40, 14], ['dynamite', '炸药', '🧨', 55, 14],
  ['land_deed', '地契', '📜', 70, 4], ['mallet', '木槌', '🔨', 70, 4], ['marker_stake', '界标', '📍', 70, 4],
];
const rowsToItems = (rows: readonly ItemRow[], category: ItemDefinition['category'], storage: ItemDefinition['storage']): ItemDefinition[] =>
  rows.map(([id, name, icon, price, level]) => ({ id, name, icon, price, level, category, storage }));

export const ITEMS: readonly ItemDefinition[] = [
  ...CROPS.map((crop): ItemDefinition => ({ id: crop.id, name: crop.name, icon: crop.emoji, storage: 'silo', price: crop.value, level: crop.level, category: 'crop' })),
  ...rowsToItems(feedRows, 'feed', 'barn'),
  ...LIVESTOCK.map((animal): ItemDefinition => ({ id: animal.product, name: animal.productName, icon: animal.productEmoji, storage: 'barn', price: animal.productValue, level: animal.level, category: 'animal' })),
  ...rowsToItems(productRows, 'product', 'barn'),
  ...rowsToItems(fruitRows, 'fruit', 'silo'),
  { id: 'fish_fillet', name: '鱼肉', icon: '🐟', storage: 'barn', price: 64, level: 10, category: 'fish' },
  { id: 'honey', name: '蜂蜜', icon: '🍯', storage: 'barn', price: 70, level: 15, category: 'animal' },
  ...rowsToItems(materialRows, 'material', 'barn'),
];

const recipe = (id: ItemId, machine: MachineId, inputs: RecipeDefinition['inputs'], minutes: number, level: number, xp: number, quantity = 1): RecipeDefinition =>
  ({ id, machine, inputs, output: id, quantity, durationMs: minute(minutes), level, xp });

/** Original illustrative game recipes. They are not food/manufacturing instructions. */
export const RECIPES: readonly RecipeDefinition[] = [
  recipe('chicken_feed', 'feed_mill', { wheat: 2, corn: 1 }, 0.5, 1, 2, 3),
  recipe('cow_feed', 'feed_mill', { soybean: 2, corn: 1 }, 1, 3, 3, 3),
  recipe('pig_feed', 'feed_mill', { carrot: 2, soybean: 1 }, 1.5, 5, 4, 3),
  recipe('sheep_feed', 'feed_mill', { wheat: 2, soybean: 1 }, 2, 7, 5, 3),
  recipe('goat_feed', 'feed_mill', { carrot: 2, corn: 1 }, 2.5, 10, 6, 3),
  recipe('bread', 'bakery', { wheat: 3 }, 2, 1, 4),
  recipe('corn_bread', 'bakery', { wheat: 2, corn: 2 }, 3, 2, 6),
  recipe('cookie', 'bakery', { wheat: 2, egg: 1, brown_sugar: 1 }, 4, 4, 8),
  recipe('pancake', 'bakery', { wheat: 2, egg: 1 }, 3, 3, 7),
  recipe('cream', 'dairy', { milk: 1 }, 2, 3, 5),
  recipe('butter', 'dairy', { milk: 2 }, 3, 4, 8),
  recipe('cheese', 'dairy', { milk: 3 }, 5, 5, 10),
  recipe('goat_cheese', 'dairy', { goat_milk: 2 }, 6, 10, 14),
  recipe('brown_sugar', 'sugar_mill', { sugarcane: 2 }, 2, 3, 5),
  recipe('white_sugar', 'sugar_mill', { sugarcane: 3 }, 3, 4, 7),
  recipe('syrup', 'sugar_mill', { sugarcane: 4 }, 4, 5, 9),
  recipe('popcorn', 'popcorn_pot', { corn: 2 }, 2, 4, 5),
  recipe('buttered_popcorn', 'popcorn_pot', { corn: 2, butter: 1 }, 4, 6, 11),
  recipe('bacon_eggs', 'bbq', { bacon: 1, egg: 2 }, 4, 5, 10),
  recipe('roasted_tomatoes', 'bbq', { tomato: 2 }, 3, 7, 10),
  recipe('carrot_pie', 'pie_oven', { wheat: 2, carrot: 3, egg: 1 }, 5, 6, 11),
  recipe('pumpkin_pie', 'pie_oven', { wheat: 2, pumpkin: 2, egg: 1 }, 6, 6, 13),
  recipe('bacon_pie', 'pie_oven', { wheat: 2, bacon: 2, egg: 1 }, 6, 7, 14),
  recipe('apple_pie', 'pie_oven', { wheat: 2, apple: 2, syrup: 1 }, 7, 8, 16),
  recipe('cotton_fabric', 'loom', { cotton: 2 }, 5, 8, 12),
  recipe('wool_sweater', 'loom', { wool: 2 }, 6, 9, 14),
  recipe('cotton_shirt', 'sewing_machine', { cotton_fabric: 2, indigo: 1 }, 7, 9, 20),
  recipe('cream_cake', 'cake_oven', { wheat: 2, cream: 1, white_sugar: 1, egg: 1 }, 7, 10, 19),
  recipe('carrot_cake', 'cake_oven', { wheat: 2, carrot: 2, brown_sugar: 1, egg: 1 }, 7, 10, 18),
  recipe('berry_cake', 'cake_oven', { wheat: 2, raspberry: 2, cream: 1, white_sugar: 1 }, 9, 11, 24),
  recipe('carrot_juice', 'juice_press', { carrot: 4 }, 4, 11, 10),
  recipe('tomato_juice', 'juice_press', { tomato: 2 }, 4, 11, 13),
  recipe('apple_juice', 'juice_press', { apple: 3 }, 5, 11, 14),
  recipe('cherry_juice', 'juice_press', { cherry: 3 }, 5, 11, 15),
  recipe('berry_jam', 'jam_maker', { blackberry: 2, raspberry: 1, white_sugar: 1 }, 8, 13, 20),
  recipe('apple_jam', 'jam_maker', { apple: 3, white_sugar: 1 }, 8, 13, 18),
  recipe('cherry_jam', 'jam_maker', { cherry: 3, white_sugar: 1 }, 8, 13, 21),
  recipe('ice_cream', 'icecream_maker', { milk: 2, cream: 1, white_sugar: 1 }, 6, 12, 16),
  recipe('strawberry_icecream', 'icecream_maker', { cream: 1, strawberry: 2, white_sugar: 1 }, 8, 12, 22),
  recipe('cherry_popsicle', 'icecream_maker', { cherry: 2, syrup: 1 }, 5, 12, 15),
  recipe('beeswax', 'honey_extractor', { honey: 2 }, 6, 15, 15),
  recipe('iron_bar', 'smelter', { iron_ore: 3, coal: 1 }, 8, 14, 18),
  recipe('gold_bar', 'smelter', { gold_ore: 3, coal: 1 }, 10, 15, 23),
  recipe('bracelet', 'jeweler', { gold_bar: 2, iron_bar: 1 }, 10, 16, 34),
  recipe('necklace', 'jeweler', { gold_bar: 2, cotton_fabric: 1 }, 12, 16, 36),
  recipe('espresso', 'coffee_kiosk', { coffee_bean: 2 }, 3, 18, 14),
  recipe('latte', 'coffee_kiosk', { coffee_bean: 2, milk: 1 }, 4, 18, 18),
  recipe('hot_chocolate', 'coffee_kiosk', { cacao: 2, milk: 1, white_sugar: 1 }, 5, 18, 22),
  recipe('toffee', 'candy_machine', { syrup: 1, butter: 1 }, 7, 19, 20),
  recipe('chocolate', 'candy_machine', { cacao: 2, milk: 1, white_sugar: 1 }, 9, 19, 25),
  recipe('soy_sauce', 'sauce_maker', { soybean: 4, wheat: 1 }, 6, 20, 16),
  recipe('tomato_sauce', 'sauce_maker', { tomato: 2, white_sugar: 1 }, 6, 20, 18),
  recipe('fish_sushi', 'sushi_bar', { fish_fillet: 2, soy_sauce: 1 }, 5, 21, 21),
  recipe('vegetable_sushi', 'sushi_bar', { carrot: 2, soybean: 2, wheat: 1 }, 5, 21, 15),
  recipe('green_salad', 'salad_bar', { carrot: 2, tomato: 1, corn: 1 }, 4, 22, 17),
  recipe('tomato_soup', 'soup_kitchen', { tomato: 2, cream: 1 }, 5, 23, 18),
  recipe('fish_soup', 'soup_kitchen', { fish_fillet: 2, potato: 1, carrot: 1 }, 6, 23, 22),
];

const itemIndex = new Map<ItemId, ItemDefinition>(ITEMS.map((item) => [item.id, item]));
const recipeIndex = new Map<ItemId, RecipeDefinition>(RECIPES.map((item) => [item.id, item]));

export function getItem(id: ItemId): ItemDefinition {
  const item = itemIndex.get(id);
  if (!item) throw new Error('找不到这种游戏物品。');
  return item;
}

export function getRecipe(id: ItemId): RecipeDefinition {
  const item = recipeIndex.get(id);
  if (!item) throw new Error('这种物品没有生产配方。');
  return item;
}
