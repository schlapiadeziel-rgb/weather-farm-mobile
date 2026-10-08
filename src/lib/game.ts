import type { WeatherDay } from './weather';

export type { WeatherDay } from './weather';
export type CropId = 'radish' | 'tomato' | 'wheat' | 'strawberry';
export type Crop = {
  id: CropId;
  name: string;
  emoji: string;
  cost: number;
  value: number;
  days: number;
  minTemp: number;
  maxTemp: number;
  minMoisture: number;
  maxMoisture: number;
};

/** All crop thresholds and rewards are game balancing values, not crop models. */
export const CROPS: readonly Crop[] = [
  { id: 'radish', name: '萝卜', emoji: '🥕', cost: 35, value: 80, days: 3, minTemp: 10, maxTemp: 27, minMoisture: 35, maxMoisture: 80 },
  { id: 'tomato', name: '番茄', emoji: '🍅', cost: 65, value: 170, days: 5, minTemp: 18, maxTemp: 30, minMoisture: 45, maxMoisture: 82 },
  { id: 'wheat', name: '小麦', emoji: '🌾', cost: 45, value: 110, days: 4, minTemp: 8, maxTemp: 26, minMoisture: 30, maxMoisture: 75 },
  { id: 'strawberry', name: '草莓', emoji: '🍓', cost: 90, value: 245, days: 6, minTemp: 12, maxTemp: 26, minMoisture: 45, maxMoisture: 80 },
];

export type AnimalId = 'chicken' | 'cow' | 'sheep';
export type Animal = {
  id: AnimalId;
  name: string;
  emoji: string;
  cost: number;
  product: string;
  productEmoji: string;
  productValue: number;
  productionDays: number;
  minTemp: number;
  maxTemp: number;
  feedCost: number;
};

/** Species ranges, feed units and production periods are game balancing only. */
export const LIVESTOCK: readonly Animal[] = [
  { id: 'chicken', name: '鸡', emoji: '🐔', cost: 120, product: '鸡蛋', productEmoji: '🥚', productValue: 38, productionDays: 2, minTemp: 12, maxTemp: 30, feedCost: 12 },
  { id: 'cow', name: '奶牛', emoji: '🐄', cost: 280, product: '牛奶', productEmoji: '🥛', productValue: 95, productionDays: 3, minTemp: 5, maxTemp: 26, feedCost: 24 },
  { id: 'sheep', name: '绵羊', emoji: '🐑', cost: 200, product: '羊毛', productEmoji: '🧶', productValue: 120, productionDays: 4, minTemp: 5, maxTemp: 28, feedCost: 18 },
];

export type AnimalPen = {
  id: number;
  animal: AnimalId | null;
  health: number;
  /** Simulated satiety, not a real feeding ration. */
  feed: number;
  progress: number;
};

export type Plot = {
  id: number;
  crop: CropId | null;
  growth: number;
  health: number;
  /** Simulated game soil moisture, not a measured volumetric water content. */
  moisture: number;
};

export type Game = {
  version: 1;
  day: number;
  coins: number;
  xp: number;
  harvests: number;
  /** Accumulated game water units; these do not correspond to real litres. */
  waterUsed: number;
  plots: Plot[];
  animals: AnimalPen[];
  productsCollected: number;
  log: string[];
};

export type Advice = {
  id: string;
  severity: 'warning' | 'tip' | 'good';
  title: string;
  detail: string;
  action?: 'water';
  plotIds?: number[];
};

const clamp = (value: number, min = 0, max = 100): number => Math.max(min, Math.min(max, value));
const round = (value: number): number => Math.round(value * 10) / 10;
const cropById = (id: CropId): Crop => {
  const crop = CROPS.find((item) => item.id === id);
  if (!crop) throw new Error('找不到这个作物。');
  return crop;
};

const animalById = (id: AnimalId): Animal => {
  const animal = LIVESTOCK.find((item) => item.id === id);
  if (!animal) throw new Error('找不到这种动物。');
  return animal;
};

const findPen = (game: Game, penId: number): AnimalPen => {
  const pen = game.animals.find((item) => item.id === penId);
  if (!pen) throw new Error('找不到这个畜栏。');
  return pen;
};

const findPlot = (game: Game, plotId: number): Plot => {
  const plot = game.plots.find((item) => item.id === plotId);
  if (!plot) throw new Error('找不到这块田。');
  return plot;
};

const addLog = (game: Game, entry: string): string[] => [entry, ...game.log].slice(0, 8);
const replacePlot = (game: Game, plot: Plot): Plot[] => game.plots.map((item) => item.id === plot.id ? plot : { ...item });
const replacePen = (game: Game, pen: AnimalPen): AnimalPen[] => game.animals.map((item) => item.id === pen.id ? pen : { ...item });

export function initialGame(): Game {
  const plots: Plot[] = Array.from({ length: 12 }, (_, index) => ({
    id: index + 1, crop: null, growth: 0, health: 100, moisture: 62,
  }));
  plots[0] = { id: 1, crop: 'radish', growth: 100, health: 96, moisture: 60 };
  plots[1] = { id: 2, crop: 'tomato', growth: 46, health: 100, moisture: 66 };
  plots[2] = { id: 3, crop: 'wheat', growth: 24, health: 100, moisture: 54 };
  return {
    version: 1, day: 1, coins: 500, xp: 0, harvests: 0, waterUsed: 0, plots,
    animals: [
      { id: 1, animal: 'chicken', health: 100, feed: 70, progress: 100 },
      { id: 2, animal: null, health: 100, feed: 0, progress: 0 },
      { id: 3, animal: null, health: 100, feed: 0, progress: 0 },
    ],
    productsCollected: 0,
    log: ['欢迎来到田野来信！1 号田的萝卜成熟了，点它试试收获。'],
  };
}

export function plant(game: Game, plotId: number, cropId: CropId): Game {
  const plot = findPlot(game, plotId);
  const crop = cropById(cropId);
  if (plot.crop) throw new Error('这块田已经有作物了。');
  if (game.coins < crop.cost) throw new Error(`金币不足，种植${crop.name}需要 ${crop.cost} 金币。`);
  return {
    ...game,
    coins: game.coins - crop.cost,
    plots: replacePlot(game, { ...plot, crop: crop.id, growth: 0, health: 100 }),
    log: addLog(game, `在 ${plotId} 号田种下${crop.name}，花费 ${crop.cost} 金币。`),
  };
}

export function water(game: Game, plotId: number): Game {
  const plot = findPlot(game, plotId);
  if (!plot.crop) throw new Error('先种植作物再浇水。');
  if (plot.health <= 0) throw new Error('作物已枯萎，请先清理田地。');
  if (plot.moisture >= 80) throw new Error('这块田已经很湿了，暂时不用浇水。');
  return {
    ...game,
    waterUsed: game.waterUsed + 20,
    plots: replacePlot(game, { ...plot, moisture: round(clamp(plot.moisture + 28)) }),
    log: addLog(game, `给 ${plotId} 号田浇水，使用 20 游戏用水单位。`),
  };
}

export function harvest(game: Game, plotId: number): Game {
  const plot = findPlot(game, plotId);
  if (!plot.crop) throw new Error('这块田还没有作物。');
  if (plot.health <= 0) throw new Error('作物已枯萎，无法收获，请清理田地。');
  if (plot.growth < 100) throw new Error('作物还没有成熟，再照顾它几天吧。');
  const crop = cropById(plot.crop);
  const reward = Math.round(crop.value * (0.5 + plot.health / 200));
  return {
    ...game,
    coins: game.coins + reward,
    xp: game.xp + 25,
    harvests: game.harvests + 1,
    plots: replacePlot(game, { ...plot, crop: null, growth: 0, health: 100 }),
    log: addLog(game, `收获 ${plotId} 号田的${crop.name}，获得 ${reward} 金币和 25 经验。`),
  };
}

export function clearPlot(game: Game, plotId: number): Game {
  const plot = findPlot(game, plotId);
  if (!plot.crop) throw new Error('这块田已经是空的。');
  if (plot.health > 0) throw new Error('作物还在生长，只有枯萎作物需要清理。');
  return {
    ...game,
    plots: replacePlot(game, { ...plot, crop: null, growth: 0, health: 100 }),
    log: addLog(game, `清理了 ${plotId} 号田，可以重新播种。`),
  };
}

export function buyAnimal(game: Game, penId: number, animalId: AnimalId): Game {
  const pen = findPen(game, penId);
  const animal = animalById(animalId);
  if (pen.animal) throw new Error('这个畜栏已经有动物了。');
  if (game.coins < animal.cost) throw new Error(`金币不足，购买${animal.name}需要 ${animal.cost} 金币。`);
  return {
    ...game,
    coins: game.coins - animal.cost,
    animals: replacePen(game, { ...pen, animal: animal.id, health: 100, feed: 70, progress: 0 }),
    log: addLog(game, `在 ${penId} 号畜栏养了${animal.name}，花费 ${animal.cost} 金币。`),
  };
}

export function feedAnimal(game: Game, penId: number): Game {
  const pen = findPen(game, penId);
  if (!pen.animal) throw new Error('这个畜栏还没有动物。');
  if (pen.health <= 0) throw new Error('动物已死亡，请先清理畜栏。');
  if (pen.feed >= 85) throw new Error('动物已经吃饱了，暂时不用喂食。');
  const animal = animalById(pen.animal);
  if (game.coins < animal.feedCost) throw new Error(`金币不足，喂食需要 ${animal.feedCost} 金币。`);
  return {
    ...game,
    coins: game.coins - animal.feedCost,
    animals: replacePen(game, { ...pen, feed: round(clamp(pen.feed + 45)) }),
    log: addLog(game, `给 ${penId} 号畜栏的${animal.name}喂食，花费 ${animal.feedCost} 金币。`),
  };
}

export function collectProduct(game: Game, penId: number): Game {
  const pen = findPen(game, penId);
  if (!pen.animal) throw new Error('这个畜栏还没有动物。');
  if (pen.health <= 0) throw new Error('动物已死亡，无法收取产物，请清理畜栏。');
  if (pen.progress < 100) throw new Error('产物还没准备好，再照顾它几天吧。');
  const animal = animalById(pen.animal);
  const reward = Math.round(animal.productValue * (0.5 + pen.health / 200));
  return {
    ...game,
    coins: game.coins + reward,
    xp: game.xp + 10,
    productsCollected: game.productsCollected + 1,
    animals: replacePen(game, { ...pen, progress: 0 }),
    log: addLog(game, `收取 ${penId} 号畜栏的${animal.product}，获得 ${reward} 金币和 10 经验。`),
  };
}

export function clearAnimal(game: Game, penId: number): Game {
  const pen = findPen(game, penId);
  if (!pen.animal) throw new Error('这个畜栏已经是空的。');
  if (pen.health > 0) throw new Error('动物还活着，只有死亡动物需要清理。');
  return {
    ...game,
    animals: replacePen(game, { ...pen, animal: null, health: 100, feed: 0, progress: 0 }),
    log: addLog(game, `清理了 ${penId} 号畜栏，可以重新养殖。`),
  };
}

function validateWeather(weather: WeatherDay): void {
  const values = [weather.temp, weather.minTemp, weather.maxTemp, weather.humidity, weather.rain, weather.rainChance, weather.wind, weather.et0];
  if (values.some((value) => !Number.isFinite(value))) {
    throw new Error('天气数据不完整，请刷新天气后再推进一天。');
  }
}

export function advanceDay(game: Game, weather: WeatherDay): Game {
  validateWeather(weather);
  // ET₀ and rain come from the forecast. This deliberately simplified game
  // conversion is not a soil balance model or an irrigation prescription.
  const rainGain = clamp(weather.rain, 0, 200) * 2.3;
  const evaporation = 3 + clamp(weather.et0, 0, 20) * 2.2;
  let stressedCount = 0;
  const plots = game.plots.map((plot): Plot => {
    const moisture = round(clamp(plot.moisture + rainGain - evaporation));
    if (!plot.crop || plot.health <= 0) return { ...plot, moisture };
    const crop = cropById(plot.crop);
    const tempDistance = Math.max(crop.minTemp - weather.temp, weather.temp - crop.maxTemp, 0);
    const dryDistance = Math.max(crop.minMoisture - moisture, 0);
    const wetDistance = Math.max(moisture - crop.maxMoisture, 0);
    const extremeHeat = Math.max(weather.maxTemp - 35, 0);
    const frost = weather.minTemp <= 0 ? 10 + Math.abs(weather.minTemp) : 0;
    const stress = tempDistance * 0.8 + dryDistance * 0.32 + wetDistance * 0.25 + extremeHeat * 0.6 + frost;
    const health = round(clamp(plot.health + (stress > 0 ? -Math.max(2, stress) : 2)));
    if (stress > 0) stressedCount += 1;
    const temperatureFactor = clamp(1 - tempDistance / 22, 0.12, 1);
    const moistureFactor = clamp(1 - (dryDistance + wetDistance) / 60, 0.15, 1);
    const healthFactor = clamp(health / 100, 0.3, 1);
    const growth = health <= 0 ? plot.growth : round(clamp(plot.growth + (100 / crop.days) * temperatureFactor * moistureFactor * healthFactor));
    return { ...plot, moisture, health, growth };
  });
  let animalStressCount = 0;
  const animals = game.animals.map((pen): AnimalPen => {
    if (!pen.animal || pen.health <= 0) return { ...pen };
    const animal = animalById(pen.animal);
    const dailyFeed = animal.id === 'chicken' ? 16 : animal.id === 'cow' ? 24 : 20;
    const feed = round(clamp(pen.feed - dailyFeed));
    const tempDistance = Math.max(animal.minTemp - weather.temp, weather.temp - animal.maxTemp, 0);
    const temperatureStress = tempDistance * 0.7 + Math.max(weather.maxTemp - 35, 0) * 0.4;
    const hungerStress = feed <= 0 ? 9 : feed < 20 ? 3 : 0;
    const dampStress = weather.humidity >= 90 && weather.rain >= 10 ? 2 : 0;
    const stress = temperatureStress + hungerStress + dampStress;
    const health = round(clamp(pen.health + (stress > 0 ? -stress : 3)));
    if (stress > 0) animalStressCount += 1;
    const feedFactor = feed <= 0 ? 0 : feed < 20 ? 0.55 : 1;
    const tempFactor = clamp(1 - tempDistance / 25, 0.15, 1);
    const progress = health <= 0 ? pen.progress : round(clamp(pen.progress + (100 / animal.productionDays) * feedFactor * tempFactor * health / 100));
    return { ...pen, feed, health, progress };
  });
  const cropImpact = stressedCount > 0 ? `${stressedCount} 块田受到环境胁迫。` : '作物继续生长。';
  const animalImpact = animalStressCount > 0 ? `${animalStressCount} 个畜栏需照顾。` : '动物状态平稳。';
  return {
    ...game,
    day: game.day + 1,
    plots,
    animals,
    log: addLog(game, `游戏第 ${game.day + 1} 天 · 参考 ${weather.date}：${round(weather.temp)}°C，降雨 ${round(weather.rain)} mm。${cropImpact}${animalImpact}`),
  };
}

/** Rule-based weather reminders; this does not diagnose crops or replace local agronomy. */
export function getAdvice(game: Game, weather: WeatherDay, observedMoisture?: number): Advice[] {
  validateWeather(weather);
  if (observedMoisture !== undefined && (!Number.isFinite(observedMoisture) || observedMoisture < 0 || observedMoisture > 100)) {
    throw new Error('土壤含水率请输入 0–100 之间的数值。');
  }
  const fieldMode = observedMoisture !== undefined;
  const growing = game.plots.filter((plot) => plot.crop && plot.health > 0);
  const dryPlots = fieldMode ? [] : growing.filter((plot) => plot.moisture < cropById(plot.crop!).minMoisture);
  const wetPlots = fieldMode ? [] : growing.filter((plot) => plot.moisture > cropById(plot.crop!).maxMoisture);
  const candidates: Advice[] = [];
  if (weather.maxTemp >= 35) candidates.push({
    id: 'heat', severity: 'warning', title: '高温天，观察叶片状态',
    detail: `预报最高 ${round(weather.maxTemp)}°C。田间可观察萎蔫与遮阴需求。若养殖鸡、牛或羊，留意饮水、通风和异常喘气，具体处理需结合当地兽医指导。`,
  });
  if (weather.minTemp < 5) candidates.push({
    id: 'cold', severity: 'warning', title: '夜间低温，留意防寒',
    detail: `预报最低 ${round(weather.minTemp)}°C。露地幼苗留意防寒。若养殖动物，检查畜舍挡风和干燥垫料，幼龄动物尤其需要关注。`,
  });
  if (weather.humidity >= 80) candidates.push({
    id: 'humidity', severity: 'warning', title: '空气潮湿，巡查病害',
    detail: `空气相对湿度 ${Math.round(weather.humidity)}%。检查叶片、通风条件；若养殖动物也可检查垫料和畜舍积水。湿度本身不能诊断植物或动物疾病。`,
  });
  if (weather.wind >= 20) candidates.push({
    id: 'wind', severity: 'warning', title: '风较大，留意设施与作业',
    detail: `预报风速 ${round(weather.wind)} km/h。检查支架和覆盖物，喷施作业需按产品标签和当地要求选择天气窗口。`,
  });
  const hungryPens = fieldMode ? [] : game.animals.filter((pen) => pen.animal && pen.health > 0 && pen.feed < 35);
  if (hungryPens.length > 0) candidates.unshift({
    id: 'animal-feed', severity: 'warning', title: `${hungryPens.length} 个游戏畜栏需要喂食`,
    detail: `${hungryPens.map((pen) => `${pen.id} 号畜栏`).join('、')}饱食度最低 ${Math.round(Math.min(...hungryPens.map((pen) => pen.feed)))} / 100。前往养殖页喂食；游戏饱食度不是现实饲喂量。`,
  });
  if (weather.maxTemp >= 32 && weather.maxTemp < 35) candidates.push({
    id: 'animal-heat', severity: 'tip', title: '养殖天气提示：留意热应激',
    detail: `预报最高 ${round(weather.maxTemp)}°C。若养殖动物，可检查饮水与畜舍通风，观察采食和呼吸状态；天气提醒不代替兽医诊断。`,
  });
  if (weather.rainChance >= 65 && weather.rain >= 3) candidates.push({
    id: 'rain', severity: 'tip', title: '雨将到来，先核对灌溉计划',
    detail: `参考日降雨概率 ${Math.round(weather.rainChance)}%，预计 ${round(weather.rain)} mm。${fieldMode ? '灌溉安排需结合实地雨量、土壤性质及作物需水情况确认。' : '游戏雨水会补充模拟湿度；现实灌溉要确认雨量、土壤状况后调整。'}`,
    ...(fieldMode ? {} : { plotIds: dryPlots.map((plot) => plot.id) }),
  });
  else if (dryPlots.length > 0) candidates.push({
    id: 'water', severity: 'warning', title: `${dryPlots.length} 块游戏田偏干`,
    detail: `模拟土壤湿度最低 ${Math.round(Math.min(...dryPlots.map((plot) => plot.moisture)))} / 100，低于作物的游戏阈值。可给标记田块浇水；该数值不是现实土壤测量。`,
    action: 'water', plotIds: dryPlots.map((plot) => plot.id),
  });
  if (wetPlots.length > 0) candidates.push({
    id: 'wet-soil', severity: 'warning', title: `${wetPlots.length} 块游戏田偏湿`,
    detail: `模拟土壤湿度最高 ${Math.round(Math.max(...wetPlots.map((plot) => plot.moisture)))} / 100，暂缓游戏浇水。现实田间是否积水需现场确认。`,
    plotIds: wetPlots.map((plot) => plot.id),
  });
  if (candidates.length === 0) candidates.push(fieldMode ? {
    id: 'field-weather', severity: 'tip', title: '当前天气平稳，结合田间观察',
    detail: `参考均温 ${round(weather.temp)}°C、空气湿度 ${Math.round(weather.humidity)}%。单次含水率输入不足以确定灌溉需求；请结合土壤类型、采样深度及作物状态确认。`,
  } : {
    id: 'growing', severity: 'good', title: growing.length ? '天气平稳，继续照顾作物' : '选一块田，开始播种',
    detail: `参考均温 ${round(weather.temp)}°C、空气湿度 ${Math.round(weather.humidity)}%。${growing.length ? '查看每块田的成熟度，成熟后及时收获。' : '萝卜只需 35 金币，通常 3 个游戏天成熟。'}`,
  });
  const moistureContext = observedMoisture === undefined
    ? '地块湿度由游戏公式模拟，未连接土壤传感器。'
    : `你输入的土壤含水率为 ${round(observedMoisture)}%，未经系统实测；不能套用游戏湿度阈值。`;
  const context: Advice = {
    id: 'context', severity: 'tip', title: '天气参考 · 游戏与田间有别',
    detail: `${weather.date} · ${round(weather.minTemp)}–${round(weather.maxTemp)}°C · 空气湿度 ${Math.round(weather.humidity)}% · 降雨 ${round(weather.rain)} mm。${moistureContext}这些规则提醒不能替代当地农技指导。`,
  };
  return [...candidates.slice(0, 3), context];
}
