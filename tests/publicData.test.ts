import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';
import { Capacitor } from '@capacitor/core';
import { cacheRead, fetchOfficialHtml, officialArticle, officialUrl, parseOfficialList, plainText, validDate } from '../src/lib/publicDataHttp.ts';
import { fetchAgriNews, NEWS_SOURCE_URL, parseNewsArticle, readCachedNews } from '../src/lib/agriNews.ts';
import { fetchMarketData, MARKET_SOURCE_URL, marketRecommendations, parseMarketBulletin, readCachedMarket, validateDemandRecord } from '../src/lib/market.ts';
import type { DemandRecord, MarketSnapshot } from '../src/lib/market.ts';

/** Real official HTML captured via HTTPS on 2026-10-09. Only metadata, dated
 * list rows and article bodies are retained; no price or news text is invented. */
const officialFixtures = {
  newsList: {
    url: "https://www.moa.gov.cn/xw/zwdt/",
    capturedAt: "2026-10-09T04:00:42.790403+00:00",
    html: `<html><body><ul>
<li class="ztlb">
						<a href="./202609/t20260930_6488347.htm" target="_blank" title='农业农村部党组召开会议强调 深入学习贯彻习近平总书记重要讲话重要指示精神 切实抓好部系统全面从严治党和农业农村各项工作'>
													 农业农村部党组召开会议强调 深入学习贯彻习近平总书记重要讲...</a>
						<span> 2026-09-30</span>
					</li>
<li class="ztlb">
						<a href="./202609/t20260930_6488345.htm" target="_blank" title='实施渔业发展支持政策 加快渔业现代化建设——农业农村部渔业渔政管理局负责人就“十五五”渔业发展支持政策答记者问'>
													 实施渔业发展支持政策 加快渔业现代化建设——农业农村部渔业...</a>
						<span> 2026-09-30</span>
					</li>
<li class="ztlb">
						<a href="./202609/t20260930_6488334.htm" target="_blank" title='上海合作组织农业技术交流培训示范基地建设协调机制第三次会议在京召开'>
													 上海合作组织农业技术交流培训示范基地建设协调机制第三次会...</a>
						<span> 2026-09-30</span>
					</li>
<li class="ztlb">
						<a href="./202609/t20260930_6488286.htm" target="_blank" title='农业农村部举办2026年中国农民丰收节乡村工匠国际交流推介活动'>
													 农业农村部举办2026年中国农民丰收节乡村工匠国际交流推介活动</a>
						<span> 2026-09-30</span>
					</li>
<li class="ztlb">
						<a href="./202609/t20260929_6488226.htm" target="_blank" title='农业农村部会同有关部门加力推进农药兽药综合整治工作'>
													 农业农村部会同有关部门加力推进农药兽药综合整治工作</a>
						<span> 2026-09-29</span>
					</li>
</ul></body></html>`,
  },
  marketList: {
    url: "https://scs.moa.gov.cn/jcyj/",
    capturedAt: "2026-10-09T04:00:44.637561+00:00",
    html: `<html><body><ul>
<li ><a href="./202610/t20261008_6488360.htm" target="_blank" title='10月8日：“农产品批发价格200指数”比节前下降0.53个点'><span class="sj_gztzle">10月8日：“农产品批发价格200指数”比节前下降0.53个点</span><span class="sj_gztzri">2026-10-08</span></a></li>
<li ><a href="./202609/t20260930_6488321.htm" target="_blank" title='9月30日：“农产品批发价格200指数”比昨天上升0.04个点'><span class="sj_gztzle">9月30日：“农产品批发价格200指数”比昨天上升0.04个点</span><span class="sj_gztzri">2026-09-30</span></a></li>
<li ><a href="./202609/t20260929_6488223.htm" target="_blank" title='9月29日：“农产品批发价格200指数”比昨天下降0.48个点'><span class="sj_gztzle">9月29日：“农产品批发价格200指数”比昨天下降0.48个点</span><span class="sj_gztzri">2026-09-29</span></a></li>
</ul></body></html>`,
  },
  newsArticle: {
    url: "https://www.moa.gov.cn/xw/zwdt/202609/t20260930_6488347.htm",
    capturedAt: "2026-10-09T04:00:46.140601+00:00",
    html: `<html><head>
<meta name="ArticleTitle" content="农业农村部党组召开会议强调 深入学习贯彻习近平总书记重要讲话重要指示精神 切实抓好部系统全面从严治党和农业农村各项工作" />
<meta name="PubDate" content="2026-09-30 20:13:00" />
<meta name="ContentSource" content="农业农村部网站" />
<meta name="source" content="农业农村部新闻办公室">
</head><body>
<div class=TRS_Editor><div style="text-align: justify;">　　本网讯<span style="font-size: 12pt;">　</span><span style="font-size: 12pt;">9月30日，农业农村部党组召开会议。部党组书记、部长张柱主持。</span></div>
<div style="text-align: justify;">　　会议传达学习中共中央政治局会议精神，强调要深入学习领会习近平党建思想，认真贯彻习近平总书记重要讲话精神，坚定不移推动部系统全面从严治党向纵深发展，为加快农业农村现代化提供坚强政治保证。部系统各级党组织要努力夯实从严管党治党责任，强化政治机关建设，巩固拓展树立和践行正确政绩观学习教育成果，全面提升党建工作质效。要从严推进正风肃纪反腐，常态长效抓好作风建设，营造风清气正的政治生态。</div>
<div style="text-align: justify;">　　会议学习贯彻习近平总书记对第九个“中国农民丰收节”作出的重要指示精神，强调要认真学习领会，扎实推进乡村全面振兴，攻坚克难、实干笃行，努力让广大农民生活更加幸福美好。要着力提升农业综合生产能力和质量效益，加力推进新一轮千亿斤粮食产能提升行动，努力增加绿色优质农产品供给。要因地制宜推进宜居宜业和美乡村建设，培育壮大乡村富民产业，深入实施乡村建设行动，加强和改进乡村治理。要提高强农惠农富农政策效能，深化农村改革，积极拓宽农民增收致富渠道。</div>
<div style="text-align: justify;">　　会议传达学习习近平总书记关于建设更高水平平安中国的重要指示精神，强调要坚定不移贯彻总体国家安全观，全力夯实农业农村安全稳定底盘，为更高水平平安中国建设提供有力支撑。要坚持和发展新时代“枫桥经验”，推动平安乡村建设，维护农村稳定安宁。</div>
<div style="text-align: justify;">　　会议深入学习领会习近平生态文明思想，传达学习近期出台的生态环境保护法律法规和政策文件，强调要切实增强政治自觉、思想自觉、行动自觉，扎实有力抓好农业农村生态环境保护工作，加快推进农业发展全面绿色转型。要统筹推进高质量发展与高水平保护，大力推进投入品减量化、生产清洁化、废弃物资源化、产业模式生态化，促进农业农村生态环境不断改善。</div>
<div style="text-align: justify;">　　会议传达学习全国安全生产视频会议精神，强调要树牢极限思维、底线思维，严格落实“三管三必须”要求，进一步压紧压实责任，全面加强农业安全生产全链条监管，紧盯海洋渔船、农机、有限空间作业等重点领域，落实落细安全生产各项措施，坚决防范遏制重特大事故发生。</div>
<div style="text-align: justify;">　　会议研究部署近期农业农村重点工作，强调要全力以赴抓好“三秋”农业生产，强化农业防灾减灾，确保秋粮丰收到手、秋冬种种足种好。要抓实抓细粮油作物大面积单产提升，分区域分作物明确主推品种和技术路线，健全高标准农田建设、运营、管护机制，扎实推进第二轮土地承包到期后再延长30年试点等农村改革重点任务。</div>
<div style="text-align: justify;">　　会议还研究了其他事项。</div></div>
</body></html>`,
  },
  marketLatest: {
    url: "https://scs.moa.gov.cn/jcyj/202610/t20261008_6488360.htm",
    capturedAt: "2026-10-09T04:00:46.155761+00:00",
    html: `<html><head>
<meta name="ArticleTitle" content="10月8日：“农产品批发价格200指数”比节前下降0.53个点" />
<meta name="PubDate" content="2026-10-08 14:33:00" />
<meta name="ContentSource" content="市场与信息化司" />
<meta name="source" content="农业农村部市场与信息化司">
</head><body>
<div class=TRS_Editor><style type="text/css">
.TRS_Editor P{line-height:2;font-family:--系统字体--;font-size:12pt;}.TRS_Editor DIV{line-height:2;font-family:--系统字体--;font-size:12pt;}.TRS_Editor TD{line-height:2;font-family:--系统字体--;font-size:12pt;}.TRS_Editor TH{line-height:2;font-family:--系统字体--;font-size:12pt;}.TRS_Editor SPAN{line-height:2;font-family:--系统字体--;font-size:12pt;}.TRS_Editor FONT{line-height:2;font-family:--系统字体--;font-size:12pt;}.TRS_Editor UL{line-height:2;font-family:--系统字体--;font-size:12pt;}.TRS_Editor LI{line-height:2;font-family:--系统字体--;font-size:12pt;}.TRS_Editor A{line-height:2;font-family:--系统字体--;font-size:12pt;}</style>
<p align="justify">　　<span><font face="仿宋_GB2312">据农业农村部监测，</font>10月8日<font face="Times New Roman">“</font><font face="仿宋_GB2312">农产品批发价格200指数</font><font face="Times New Roman">”</font><font face="仿宋_GB2312">为114.83，比</font></span><span><font face="仿宋_GB2312">节前（</font><font face="仿宋_GB2312">9月30日，下同）</font></span><span><font face="仿宋_GB2312">下降</font>0.53个点，<font face="Times New Roman">“</font><font face="仿宋_GB2312">菜篮子</font><font face="Times New Roman">”</font><font face="仿宋_GB2312">产品批发价格指数为114.98，比</font></span><span>节前</span><span><font face="仿宋_GB2312">下降</font>0.60个点。截至今日14:00时，全国农产品批发市场猪肉平均价格为16.1</span><span>0</span><span><font face="仿宋_GB2312">元</font>/公斤，比</span><span>节前</span><span><font face="仿宋_GB2312">下降</font>1.9%；牛肉73.14元/公斤，比</span><span>节前</span><span><font face="仿宋_GB2312">下降</font>0.2%；羊肉67.77元/公斤，比</span><span>节前</span><span><font face="仿宋_GB2312">上升</font>0.4%；鸡蛋10.07元/公斤，比</span><span>节前</span><span><font face="仿宋_GB2312">下降</font>4.3%；白条鸡17.5</span><span>0</span><span><font face="仿宋_GB2312">元</font>/公斤，比</span><span>节前</span><span><font face="仿宋_GB2312">上升</font>1.6%。重点监测的28种蔬菜平均价格为4.35元/公斤，比</span><span>节前</span><span><font face="仿宋_GB2312">下降</font>0.5%；重点监测的6种水果平均价格为6.57元/公斤，比</span><span>节前</span><span><font face="仿宋_GB2312">下降</font>2.4%。鲫鱼19.5</span><span>0</span><span><font face="仿宋_GB2312">元</font>/公斤，比</span><span>节前</span><span><font face="仿宋_GB2312">下降</font>0.7%；鲤鱼14.15元/公斤，比</span><span>节前</span><span><font face="仿宋_GB2312">上升</font>1.0%；白鲢鱼10.24元/公斤，比</span><span>节前</span><span><font face="仿宋_GB2312">上升</font>2.8%；大带鱼42.38元/公斤，比</span><span>节前</span><span><font face="仿宋_GB2312">下降</font>0.1%。</span>&nbsp;</p>
<p align="justify">　　<span><font face="仿宋_GB2312">今日，国内鲜活农产品批发市场重点监测的</font>46个品种中，与</span><span>节前</span><span><font face="仿宋_GB2312">相比价格升幅前五名的是黄瓜、西瓜、豆角、平菇和油菜，幅度分别为</font>8.7%、5.8%、3.9%、3.8%和3.8%；价格降幅前五名的是青椒、菠菜、菠萝、鸡蛋和生姜，幅度分别为6.4%、5.8%、5.1%、4.3%和3.7%。</span>&nbsp;</p></div>
</body></html>`,
  },
  marketPrevious: {
    url: "https://scs.moa.gov.cn/jcyj/202609/t20260930_6488321.htm",
    capturedAt: "2026-10-09T04:00:46.133504+00:00",
    html: `<html><head>
<meta name="ArticleTitle" content="9月30日：“农产品批发价格200指数”比昨天上升0.04个点" />
<meta name="PubDate" content="2026-09-30 16:43:00" />
<meta name="ContentSource" content="市场与信息化司" />
<meta name="source" content="农业农村部市场与信息化司">
</head><body>
<div class=TRS_Editor>&nbsp;<font face="仿宋_GB2312" style="font-size: 16pt; font-family: 仿宋_GB2312;">据农业农村部监测，</font><span style="font-size: 16pt; font-family: 仿宋_GB2312;">9月30日</span><font face="Times New Roman" style="font-size: 16pt;">“</font><font face="仿宋_GB2312" style="font-size: 16pt; font-family: 仿宋_GB2312;">农产品批发价格200指数</font><font face="Times New Roman" style="font-size: 16pt;">”</font><font face="仿宋_GB2312" style="font-size: 16pt; font-family: 仿宋_GB2312;">为115.36，比昨天上升0.04个点，</font><font face="Times New Roman" style="font-size: 16pt;">“</font><font face="仿宋_GB2312" style="font-size: 16pt; font-family: 仿宋_GB2312;">菜篮子</font><font face="Times New Roman" style="font-size: 16pt;">”</font><font face="仿宋_GB2312" style="font-size: 16pt; font-family: 仿宋_GB2312;">产品批发价格指数为115.58，比昨天上升0.02个点。截至今日14:00时，全国农产品批发市场猪肉平均价格为16.42元/公斤，比昨天上升1.1%；牛肉73.26元/公斤，比昨天上升1.1%；羊肉67.50元/公斤，比昨天上升1.1%；鸡蛋10.52元/公斤，比昨天下降0.5%；白条鸡17.22元/公斤，比昨天上升0.6%。重点监测的28种蔬菜平均价格为4.37元/公斤，比昨天上升0.5%；重点监测的6种水果平均价格为6.73元/公斤，比昨天上升1.7%。鲫鱼19.63元/公斤，比昨天上升2.0%；鲤鱼14.01元/公斤，比昨天上升2.0%；白鲢鱼9.96元/公斤，比昨天上升1.5%；大带鱼42.43元/公斤，比昨天上升2.6%。</font>
<p class="MsoNormal" style="margin: 0pt 0pt 0.0001pt; text-indent: 32.25pt; line-height: 32px; font-family: 仿宋_GB2312; font-size: 16pt;"><span style="font-size: 16pt;"><font face="仿宋_GB2312">今日，国内鲜活农产品批发市场重点监测的</font>46个品种中，与昨天相比价格升幅前五名的是菠萝、鸭梨、莲藕、葱头和油菜，幅度分别为4.8%、3.5%、3.3%、3.1%和2.6%；价格降幅前五名的是洋白菜、胡萝卜、西瓜、土豆和豆角，幅度分别为3.4%、1.8%、1.7%、1.3%和1.2%。</span><span style="font-size: 16pt;"><o:p></o:p></span></p></div>
</body></html>`,
  },
  marketPrior: {
    url: "https://scs.moa.gov.cn/jcyj/202609/t20260929_6488223.htm",
    capturedAt: "2026-10-09T04:00:47.965129+00:00",
    html: `<html><head>
<meta name="ArticleTitle" content="9月29日：“农产品批发价格200指数”比昨天下降0.48个点" />
<meta name="PubDate" content="2026-09-29 14:19:00" />
<meta name="ContentSource" content="市场与信息化司" />
<meta name="source" content="农业农村部市场与信息化司">
</head><body>
<div class=TRS_Editor><style type="text/css">
.TRS_Editor P{line-height:2;font-family:--系统字体--;font-size:12pt;}.TRS_Editor DIV{line-height:2;font-family:--系统字体--;font-size:12pt;}.TRS_Editor TD{line-height:2;font-family:--系统字体--;font-size:12pt;}.TRS_Editor TH{line-height:2;font-family:--系统字体--;font-size:12pt;}.TRS_Editor SPAN{line-height:2;font-family:--系统字体--;font-size:12pt;}.TRS_Editor FONT{line-height:2;font-family:--系统字体--;font-size:12pt;}.TRS_Editor UL{line-height:2;font-family:--系统字体--;font-size:12pt;}.TRS_Editor LI{line-height:2;font-family:--系统字体--;font-size:12pt;}.TRS_Editor A{line-height:2;font-family:--系统字体--;font-size:12pt;}</style>
<p>　　<font face="仿宋_GB2312">据农业农村部监测，</font><span>9月29日</span><font face="Times New Roman">“</font><font face="仿宋_GB2312">农产品批发价格200指数</font><font face="Times New Roman">”</font><font face="仿宋_GB2312">为115.32，比昨天下降0.48个点，</font><font face="Times New Roman">“</font><font face="仿宋_GB2312">菜篮子</font><font face="Times New Roman">”</font><font face="仿宋_GB2312">产品批发价格指数为115.56，比昨天下降0.55个点。截至今日14:00时，全国农产品批发市场猪肉平均价格为16.24元/公斤，比昨天下降1.2%；牛肉72.44元/公斤，比昨天上升0.6%；羊肉66.78元/公斤，比昨天下降0.3%；鸡蛋10.57元/公斤，比昨天下降0.9%；白条鸡17.11元/公斤，比昨天下降1.0%。重点监测的28种蔬菜平均价格为4.35元/公斤，比昨天下降1.1%；重点监测的6种水果平均价格为6.62元/公斤，比昨天下降0.6%。鲫鱼19.25元/公斤，比昨天下降0.9%；鲤鱼13.73元/公斤，比昨天下降0.7%；白鲢鱼9.81元/公斤，比昨天下降2.3%；大带鱼41.35元/公斤，比昨天上升0.1%。</font></p>
<p align="justify">　　<span><font face="仿宋_GB2312">今日，国内鲜活农产品批发市场重点监测的</font>46个品种中，与昨天相比价格升幅前五名的是西瓜、巨峰葡萄、大黄花鱼、胡萝卜和青椒，幅度分别为4.2%、1.6%、1.6%、1.3%和1.1%；价格降幅前五名的是菠萝、平菇、油菜、花鲢鱼和菠菜，幅度分别为5.8%、3.4%、3.1%、2.8%和2.7%。</span><span><o:p></o:p></span>&nbsp;</p></div>
</body></html>`,
  },
} as const;

const originalFetch = globalThis.fetch;
const originalStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
const originalNativeCheck = Capacitor.isNativePlatform;
let stored = new Map<string, string>();

beforeEach(() => {
  stored = new Map();
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => stored.get(key) ?? null,
      setItem: (key: string, value: string) => { stored.set(key, value); },
    },
  });
  Capacitor.isNativePlatform = () => false;
});
afterEach(() => {
  globalThis.fetch = originalFetch;
  Capacitor.isNativePlatform = originalNativeCheck;
  if (originalStorage) Object.defineProperty(globalThis, 'localStorage', originalStorage);
  else Reflect.deleteProperty(globalThis, 'localStorage');
});

function response(html: string, url: string): Response {
  const result = new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
  Object.defineProperty(result, 'url', { value: url });
  return result;
}

function latestMarket(): MarketSnapshot {
  return parseMarketBulletin(officialFixtures.marketLatest.html, officialFixtures.marketLatest.url);
}

// Local demand scenarios are test inputs, not claimed buyer activity.
function record(overrides: Partial<DemandRecord> = {}): DemandRecord {
  return { id: 'test-local-order', product: '猪肉', region: '测试县', kind: 'order', quantityKg: 100, date: '2026-09-30', confirmed: true, ...overrides };
}

test('captured MOA lists preserve actual headline dates and allowlisted article URLs', () => {
  const news = parseOfficialList(officialFixtures.newsList.html, NEWS_SOURCE_URL);
  assert.equal(news[0].url, officialFixtures.newsArticle.url);
  assert.equal(news[0].publishedAt, '2026-09-30');
  assert.match(news[0].title, /农业农村部党组召开会议/);
  assert.notEqual(news[0].publishedAt, officialFixtures.newsList.capturedAt.slice(0, 10));
  const market = parseOfficialList(officialFixtures.marketList.html, MARKET_SOURCE_URL);
  assert.equal(market[0].url, officialFixtures.marketLatest.url);
  assert.equal(market[0].publishedAt, '2026-10-08');
  assert.equal(market[1].publishedAt, '2026-09-30');
  assert.equal(market[2].publishedAt, '2026-09-29');
  assert.ok([...news, ...market].every((item) => officialUrl(item.url) === item.url));
});

test('official URLs reject spoofed hosts, credentials, ports, and executable schemes', () => {
  for (const value of ['https://www.moa.gov.cn.evil.test/a', 'https://evil.test/www.moa.gov.cn/a', 'https://user@www.moa.gov.cn/a', 'https://www.moa.gov.cn:8443/a', 'javascript:alert(1)', 'data:text/html,test', 'file:///etc/passwd']) {
    assert.equal(officialUrl(value), null, value);
  }
  assert.equal(officialUrl('http://scs.moa.gov.cn/jcyj/?a=1&amp;b=2#fragment'), 'https://scs.moa.gov.cn/jcyj/?a=1&b=2');
  assert.equal(officialUrl('./202610/t20261008_6488360.htm', MARKET_SOURCE_URL), officialFixtures.marketLatest.url);
  const untrusted = officialFixtures.marketList.html.replace(/href=(['"])[^'"]+\1/g, 'href="https://evil.test/t20261008_6488360.htm"');
  assert.throws(() => parseOfficialList(untrusted, MARKET_SOURCE_URL), /资讯列表暂时无法解析/);
  assert.throws(() => parseOfficialList(officialFixtures.marketList.html, 'https://evil.test/'), /来源地址不受支持/);
});

test('actual nested MOA body is text only and uses article publication time and source', () => {
  const item = parseNewsArticle(officialFixtures.newsArticle.html, officialFixtures.newsArticle.url);
  assert.equal(item.publishedAt, '2026-09-30T20:13:00+08:00');
  assert.equal(item.source, '农业农村部新闻办公室');
  assert.match(item.summary, /^本网讯 9月30日，农业农村部党组召开会议/);
  assert.ok(item.summary.length <= 61);
  const article = officialArticle(officialFixtures.newsArticle.html);
  assert.match(article.text, /会议还研究了其他事项。/); // balanced extraction reaches the final nested div
  assert.doesNotMatch(article.text, /<span|<div/);
  assert.equal(plainText('<p>保留正文&amp;单位</p><script>forgedPrice()</script><style>.hidden{}</style><iframe>伪造内容</iframe>'), '保留正文&单位');
});

test('impossible dates and malformed publication times do not become sourced news', () => {
  assert.equal(validDate('2026-02-30'), false);
  assert.equal(validDate('2024-02-29'), true);
  assert.throws(() => officialArticle(officialFixtures.newsArticle.html.replace('2026-09-30 20:13:00', '2026-02-30 20:13:00')), /格式已变化|发布日期|日期/);
  assert.throws(() => officialArticle(officialFixtures.newsArticle.html.replace('2026-09-30 20:13:00', '2026-09-30 99:13:00')), /格式已变化|发布日期|日期|时间/);
});

test('actual Oct 8 bulletin retains explicit yuan per kilogram prices and 14:00 quote time', () => {
  const snapshot = latestMarket();
  assert.equal(snapshot.index, 114.83);
  assert.equal(snapshot.quotedAt, '2026-10-08T14:00:00+08:00');
  assert.notEqual(snapshot.quotedAt, officialArticle(officialFixtures.marketLatest.html).publishedAt);
  assert.deepEqual(snapshot.quotes.map(({ product, price }) => ({ product, price })), [
    { product: '猪肉', price: 16.10 }, { product: '牛肉', price: 73.14 }, { product: '羊肉', price: 67.77 },
    { product: '鸡蛋', price: 10.07 }, { product: '白条鸡', price: 17.50 },
    { product: '28种蔬菜均价', price: 4.35 }, { product: '6种水果均价', price: 6.57 },
  ]);
  assert.ok(snapshot.quotes.every((quote) => quote.unit === '元/公斤' && quote.region === '全国批发市场均价' && quote.sourceUrl === officialFixtures.marketLatest.url));
  assert.equal(snapshot.warning, undefined);
});

test('unsupported units, absent quote time and non-market articles fail without invented prices', () => {
  const fixture = officialFixtures.marketLatest;
  assert.throws(() => parseMarketBulletin(fixture.html.replaceAll('/公斤', '/斤'), fixture.url), /未找到可核实的元\/公斤报价/);
  assert.throws(() => parseMarketBulletin(fixture.html.replace('截至今日14:00时', '截至今日25:00时'), fixture.url), /报价时点/);
  assert.throws(() => parseMarketBulletin(officialFixtures.newsArticle.html, officialFixtures.newsArticle.url), /不是农产品批发价格每日通报/);
  const previous = officialFixtures.marketPrevious;
  const partial = parseMarketBulletin(previous.html.replace('猪肉平均价格为16.42元/公斤', '猪肉平均价格为16.42元/斤'), previous.url);
  assert.equal(partial.quotes.length, 6);
  assert.ok(!partial.quotes.some((quote) => quote.product === '猪肉'));
  assert.match(partial.warning || '', /缺少可核实报价：猪肉/);
});

test('unavailable news bodies retain only verified official list headlines with no fabricated summary', async () => {
  globalThis.fetch = (async (input) => {
    const url = String(input);
    if (url === NEWS_SOURCE_URL) return response(officialFixtures.newsList.html, url);
    throw new Error('test body unavailable');
  }) as typeof fetch;
  const feed = await fetchAgriNews();
  assert.equal(feed.status, 'live');
  assert.equal(feed.items.length, 5);
  assert.ok(feed.items.every((item) => item.summary === '' && item.publishedAt.startsWith('2026-09-')));
  assert.match(feed.warning || '', /5 篇正文暂不可读取/);
  assert.equal(feed.sourceUrl, NEWS_SOURCE_URL);
  const cached = readCachedNews();
  assert.equal(cached?.status, 'cached');
  assert.equal(cached?.fetchedAt, feed.fetchedAt);
});

test('network failures return clearly labeled news cache without altering original dates', async () => {
  const item = parseNewsArticle(officialFixtures.newsArticle.html, officialFixtures.newsArticle.url);
  stored.set('fieldletter.news.v1', JSON.stringify({ items: [item], fetchedAt: officialFixtures.newsArticle.capturedAt, sourceUrl: NEWS_SOURCE_URL, status: 'live' }));
  globalThis.fetch = (async () => { throw new TypeError('test offline'); }) as typeof fetch;
  const cached = await fetchAgriNews();
  assert.equal(cached.status, 'cached');
  assert.equal(cached.items[0].publishedAt, item.publishedAt);
  assert.equal(cached.fetchedAt, officialFixtures.newsArticle.capturedAt);
  assert.match(cached.warning || '', /并非本次更新/);
  stored.clear();
  await assert.rejects(fetchAgriNews(), /跨域或网络限制/);
});

test('cached news rejects corrupted JSON, foreign sources, and invalid timestamps', () => {
  stored.set('fieldletter.news.v1', '{broken');
  assert.equal(cacheRead('fieldletter.news.v1'), null);
  assert.equal(readCachedNews(), null);
  const item = parseNewsArticle(officialFixtures.newsArticle.html, officialFixtures.newsArticle.url);
  const feed = { items: [item], fetchedAt: officialFixtures.newsArticle.capturedAt, sourceUrl: NEWS_SOURCE_URL };
  stored.set('fieldletter.news.v1', JSON.stringify({ ...feed, items: [{ ...item, url: 'https://evil.test/news' }] }));
  assert.equal(readCachedNews(), null);
  stored.set('fieldletter.news.v1', JSON.stringify({ ...feed, items: [{ ...item, publishedAt: '2026-09-30T99:00:00+08:00' }] }));
  assert.equal(readCachedNews(), null);
});

test('market refresh reads the captured official reports and marks cached failure explicitly', async () => {
  const htmlByUrl = new Map([
    [MARKET_SOURCE_URL, officialFixtures.marketList.html],
    [officialFixtures.marketLatest.url, officialFixtures.marketLatest.html],
    [officialFixtures.marketPrevious.url, officialFixtures.marketPrevious.html],
    [officialFixtures.marketPrior.url, officialFixtures.marketPrior.html],
  ]);
  globalThis.fetch = (async (input) => {
    const url = String(input);
    assert.ok(htmlByUrl.has(url), `unexpected request: ${url}`);
    return response(htmlByUrl.get(url)!, url);
  }) as typeof fetch;
  const live = await fetchMarketData();
  assert.equal(live.status, 'live');
  assert.equal(live.history.length, 14);
  assert.equal(live.quotedAt, '2026-10-08T14:00:00+08:00');
  globalThis.fetch = (async () => { throw new TypeError('test offline'); }) as typeof fetch;
  const cached = await fetchMarketData();
  assert.equal(cached.status, 'cached');
  assert.deepEqual(cached.quotes, live.quotes);
  assert.equal(cached.fetchedAt, live.fetchedAt);
  assert.match(cached.warning || '', /本机缓存.*报价时间/);
  stored.clear();
  await assert.rejects(fetchMarketData(), /跨域或网络限制/);
});

test('cached market rejects unknown units, foreign links and impossible normalized dates', () => {
  const snapshot = latestMarket();
  for (const quote of [
    { ...snapshot.quotes[0], unit: '元/斤' },
    { ...snapshot.quotes[0], sourceUrl: 'https://scs.moa.gov.cn.evil.test/report' },
    { ...snapshot.quotes[0], quotedAt: '2026-02-30T14:00:00+08:00' },
  ]) {
    stored.set('fieldletter.market.v1', JSON.stringify({ ...snapshot, quotes: [quote] }));
    assert.equal(readCachedMarket(), null);
  }
});

test('official transport rejects foreign redirects and surfaces browser CORS errors', async () => {
  globalThis.fetch = (async () => response(officialFixtures.marketLatest.html, 'https://evil.test/redirect')) as typeof fetch;
  await assert.rejects(fetchOfficialHtml(officialFixtures.marketLatest.url), /不受支持的地址/);
  globalThis.fetch = (async () => { throw new TypeError('Failed to fetch'); }) as typeof fetch;
  await assert.rejects(fetchOfficialHtml(officialFixtures.marketLatest.url), /网页预览受官网跨域或网络限制/);
});

test('invalid demand data and future, old, or unconfirmed requests cannot justify production advice', () => {
  assert.equal(validateDemandRecord(record({ quantityKg: Number.NaN })), false);
  assert.equal(validateDemandRecord(record({ date: '2026-02-30' })), false);
  assert.equal(validateDemandRecord(record({ unitPrice: -1 })), false);
  const records = [record({ confirmed: false }), record({ date: '2026-10-10' }), record({ date: '2026-09-01' })];
  const tips = marketRecommendations(latestMarket(), records, new Date('2026-10-09T12:00:00+08:00'));
  assert.ok(tips.some((tip) => tip.id === 'verify-demand'));
  assert.ok(!tips.some((tip) => tip.id.startsWith('demand-')));
  const expired = marketRecommendations(latestMarket(), [], new Date('2026-10-12T14:00:01+08:00'));
  assert.ok(expired.some((tip) => tip.id === 'stale-prices'));
  const future = marketRecommendations(latestMarket(), [], new Date('2026-10-08T13:59:59+08:00'));
  assert.ok(future.some((tip) => tip.id === 'stale-prices'));
});

test('actual price rise never implies demand growth, expansion or a profit forecast', () => {
  const snapshot = parseMarketBulletin(officialFixtures.marketPrevious.html, officialFixtures.marketPrevious.url);
  snapshot.history = parseMarketBulletin(officialFixtures.marketPrior.html, officialFixtures.marketPrior.url).quotes;
  assert.ok(snapshot.quotes[0].price > snapshot.history[0].price); // sourced 16.24 -> 16.42
  const now = new Date('2026-09-30T18:00:00+08:00');
  const noOrders = marketRecommendations(snapshot, [], now);
  assert.ok(noOrders.some((tip) => tip.id === 'verify-demand'));
  assert.ok(!noOrders.some((tip) => tip.id.startsWith('demand-')));
  assert.match(noOrders.find((tip) => tip.id === 'price-scope')?.detail || '', /不能判断买家需求是否增加/);
  const orders = marketRecommendations(snapshot, [record()], now);
  const comparison = orders.find((tip) => tip.id === 'observed-price-change');
  assert.ok(comparison);
  assert.match(comparison.detail, /16\.24 到 16\.42 元\/公斤/);
  assert.match(comparison.detail, /不代表当地买家需求或未来售价/);
  assert.ok(!orders.some((tip) => /建议.*扩种|建议.*扩养|建议.*扩大产量|需求.*增长/.test(`${tip.title} ${tip.detail}`)));
});

test('the real holiday gap and incompatible product or unit never produce a recent price trend', () => {
  const now = new Date('2026-10-09T12:00:00+08:00');
  const snapshot = latestMarket();
  snapshot.history = parseMarketBulletin(officialFixtures.marketPrevious.html, officialFixtures.marketPrevious.url).quotes;
  assert.ok(!marketRecommendations(snapshot, [record({ date: '2026-10-08' })], now).some((tip) => tip.id === 'observed-price-change'));
  const recent = parseMarketBulletin(officialFixtures.marketPrevious.html, officialFixtures.marketPrevious.url);
  const prior = parseMarketBulletin(officialFixtures.marketPrior.html, officialFixtures.marketPrior.url);
  recent.history = [{ ...prior.quotes[0], product: '白条鸡' }];
  recent.quotes = [recent.quotes[0]];
  assert.ok(!marketRecommendations(recent, [record()], new Date('2026-09-30T18:00:00+08:00')).some((tip) => tip.id === 'observed-price-change'));
  recent.history = [{ ...prior.quotes[0], unit: '元/斤' as '元/公斤' }];
  assert.ok(!marketRecommendations(recent, [record()], new Date('2026-09-30T18:00:00+08:00')).some((tip) => tip.id === 'observed-price-change'));
});

test('confirmed inquiries stay separate from orders and cost comparison uses only matching local records', () => {
  const records = [record(), record({ id: 'test-inquiry', kind: 'purchase', quantityKg: 500 }), record({ id: 'test-unconfirmed', quantityKg: 700, confirmed: false })];
  const now = new Date('2026-09-30T18:00:00+08:00');
  const tips = marketRecommendations(null, records, now);
  const local = tips.find((tip) => tip.id.startsWith('demand-'));
  assert.match(local?.detail || '', /1 条已确认订单，共 100 公斤/);
  assert.match(local?.detail || '', /1 条已核实采购询价，未计入订单量/);
  const costRecords = [record({ unitPrice: 10 }), record({ id: 'test-cost', kind: 'cost', unitPrice: 12 }), record({ id: 'different-region', kind: 'cost', region: '其他县', unitPrice: 1 })];
  const costTip = marketRecommendations(null, costRecords, now).find((tip) => tip.id.startsWith('cost-'));
  assert.equal(costTip?.severity, 'warning');
  assert.match(costTip?.detail || '', /订单 10\.00 元\/公斤，单位成本 12\.00 元\/公斤，差额 -2\.00/);
  assert.match(costTip?.detail || '', /不是利润预测/);
});
