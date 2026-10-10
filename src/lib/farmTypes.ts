/** Independent game data. None of this describes a real farm or medical evidence. */
export type CropId = 'wheat'|'corn'|'carrot'|'soybean'|'sugarcane'|'indigo'|'pumpkin'|'cotton'|'tomato'|'potato'|'strawberry'|'radish';
export type AnimalId = 'chicken'|'cow'|'pig'|'sheep'|'goat';
export type MachineId = 'feed_mill'|'bakery'|'dairy'|'sugar_mill'|'popcorn_pot'|'bbq'|'pie_oven'|'loom'|'sewing_machine'|'cake_oven'|'juice_press'|'icecream_maker'|'jam_maker'|'smelter'|'jeweler'|'coffee_kiosk'|'honey_extractor'|'candy_machine'|'sauce_maker'|'sushi_bar'|'salad_bar'|'soup_kitchen';
export type ItemId = CropId|'chicken_feed'|'cow_feed'|'pig_feed'|'sheep_feed'|'goat_feed'|'egg'|'milk'|'bacon'|'wool'|'goat_milk'|'bread'|'corn_bread'|'cookie'|'pancake'|'cream'|'butter'|'cheese'|'goat_cheese'|'brown_sugar'|'white_sugar'|'syrup'|'popcorn'|'buttered_popcorn'|'bacon_eggs'|'roasted_tomatoes'|'carrot_pie'|'pumpkin_pie'|'bacon_pie'|'apple_pie'|'cotton_fabric'|'wool_sweater'|'cotton_shirt'|'cream_cake'|'carrot_cake'|'berry_cake'|'carrot_juice'|'tomato_juice'|'apple_juice'|'cherry_juice'|'berry_jam'|'apple_jam'|'cherry_jam'|'ice_cream'|'strawberry_icecream'|'cherry_popsicle'|'apple'|'cherry'|'raspberry'|'blackberry'|'cacao'|'coffee_bean'|'fish_fillet'|'honey'|'beeswax'|'coal'|'iron_ore'|'gold_ore'|'iron_bar'|'gold_bar'|'bracelet'|'necklace'|'espresso'|'latte'|'hot_chocolate'|'toffee'|'chocolate'|'soy_sauce'|'tomato_sauce'|'fish_sushi'|'vegetable_sushi'|'green_salad'|'tomato_soup'|'fish_soup'|'plank'|'screw'|'bolt'|'duct_tape'|'nail'|'wood_panel'|'saw'|'axe'|'shovel'|'dynamite'|'land_deed'|'mallet'|'marker_stake';
export type StorageKind = 'silo'|'barn';
export interface ItemDefinition { id:ItemId; name:string; icon:string; storage:StorageKind; price:number; level:number; category:'crop'|'feed'|'animal'|'product'|'fruit'|'fish'|'material'; }
export interface CropDefinition { id:CropId; name:string; emoji:string; cost:number; value:number; days:number; durationMs:number; level:number; xp:number; minTemp:number;maxTemp:number;minMoisture:number;maxMoisture:number; }
export interface AnimalDefinition { id:AnimalId;name:string;emoji:string;cost:number;level:number;product:ItemId;productName:string;productEmoji:string;productValue:number;productionDays:number;durationMs:number;feedItem:ItemId;feedCost:number;minTemp:number;maxTemp:number; }
export interface MachineDefinition { id:MachineId;name:string;level:number;cost:number; }
export interface RecipeDefinition { id:ItemId;machine:MachineId;inputs:Partial<Record<ItemId,number>>;output:ItemId;quantity:number;durationMs:number;level:number;xp:number; }
export interface Plot { id:number;crop:CropId|null;growth:number;health:number;moisture:number;plantedAt?:number;readyAt?:number; }
export interface AnimalPen { id:number;animal:AnimalId|null;health:number;feed:number;progress:number;fedAt?:number;readyAt?:number; }
export interface ProductionJob { id:string;recipe:ItemId;startedAt:number;readyAt:number; }
export interface FarmMachine { id:MachineId;slots:number;queue:ProductionJob[]; }
export interface GameOrder { id:string;kind:'truck'|'boat';requirements:Partial<Record<ItemId,number>>;coins:number;xp:number; }
export interface RoadsideSlot { id:string;item:ItemId;quantity:number;unitPrice:number;listedAt:number;soldAt:number;collected:boolean; }
export interface OrchardPlot { id:number;fruit:'apple'|'cherry'|'raspberry'|'blackberry'|'cacao'|'coffee_bean';harvests:number;readyAt:number;needsHelp:boolean;revived:boolean; }
export interface Game {
 version:2; day:number;coins:number;gems:number;xp:number;harvests:number;waterUsed:number;productsCollected:number;
 plots:Plot[];animals:AnimalPen[];log:string[];inventory:Partial<Record<ItemId,number>>;siloCapacity:number;barnCapacity:number;
 unlockedPlots:number;machines:FarmMachine[];orders:GameOrder[];ordersDelivered:number;orderSerial:number;shopListings:RoadsideSlot[];
 orchard:OrchardPlot[];fishingReadyAt:number;mineReadyAt:number;beehiveBuilt:boolean;beehiveReadyAt:number;achievements:string[];
}
