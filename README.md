# 田野来信 · Weather Farm

真实天气驱动的**中文横屏安卓农场手游原型**。用手机触屏操作 12 块田地，种植、浇水、收获，也能饲养鸡、奶牛和绵羊；气温、空气湿度、降雨与蒸散预报影响游戏中的生长和产出，并生成有天气依据的农事建议。

![横屏种植界面](docs/planting.png)
![横屏养殖界面](docs/livestock.png)

截图为开发预览，天气数值以打开游戏时获取的数据为准。

## 现有功能

- 横屏触控农场，萝卜、番茄、小麦、草莓四种作物；鸡、奶牛、绵羊三种养殖伙伴。
- 完整种植 → 天气驱动生长 → 浇水 → 收获 → 金币与经验循环。
- 购买动物 → 喂养 → 天气驱动养殖状态 → 收集鸡蛋、牛奶、羊毛；健康和饱食度影响游戏产出。
- Open-Meteo 实况及 7 日预报：温度、空气相对湿度、降水、风速、天气代码、参考蒸散量。
- 常用城市、城市搜索和可选手机定位；定位只用于天气查询，不上传农场存档。
- 高温、低温、潮湿、大风、降雨与补水提醒；养殖通风、饮水、垫料检查提示，展示依据。
- 可输入实测土壤含水率；留空时明确使用游戏模拟水分。
- 本机自动存档、农场日记、可选触控音效与原生震动。
- 天气失败时显示错误或上次缓存，不用虚构天气替代真实数据。

## 本地运行

要求 Node.js 22 或更新版本。

```bash
npm ci
npm run dev
```

浏览器打开开发服务器地址，手机请横屏。网页是手游界面的开发预览，原生 Android 项目在 `android/`。

```bash
npm test
npm run build
```

## 构建安卓 APK

要求 JDK 21、Android SDK（版本由 `android/variables.gradle` 指定）和网络连接。

```bash
npm run android:sync
cd android
./gradlew assembleDebug
```

输出：`android/app/build/outputs/apk/debug/app-debug.apk`。这是已用开发密钥签名的调试安装包，用于试玩，不是应用商店发布包。若安卓提示未知来源安装，请只为你用于打开该 APK 的应用允许安装。

也可在 GitHub Actions 运行 **Build Android APK**；成功后下载 `田野来信-Android` 构建产物中的 APK。仓库内含自动构建工作流。

## 数据与模型的边界

- 天气 API 是区域气象模型/实况产品，**不是农田传感器实测**。来源：[Open-Meteo](https://open-meteo.com/)（[API 文档](https://open-meteo.com/en/docs)、[数据许可](https://open-meteo.com/en/terms)）。气象数据按 CC BY 4.0 使用并署名；免费 API 的用途及限额遵循服务条款，商业上线前需检查适用方案。
- 土壤水分、动物饱食度、健康、作物周期、养殖产出、金币与收益属于游戏模型，阈值用于游戏平衡，没有经过农学效果验证。
- 一个游戏天并不等于真实作物生长一天；游戏参考 7 日预报循环。界面同时显示游戏天数与参考预报日期。
- 实测输入只用于规则参考；它不能替代土壤质地、根系深度、品种、生长阶段与当地农技指导，也不是自动喷药/灌溉控制。
- 存档只保存在本机 WebView/浏览器，换设备不会同步。清除应用数据或重开农场会删除存档。
- 不需要天气 API 密钥，没有账号、广告、付费或后台跟踪。

## 结构

```text
src/App.tsx          横屏游戏界面与本机存档
src/styles.css      触屏布局与视觉样式
src/lib/weather.ts  天气与城市查询、数据校验
src/lib/game.ts     无副作用的游戏与建议规则
tests/              玩法、边界及天气错误测试
public/             原创农场场景与图标
android/            原生安卓容器
```

源码为这个项目原创实现；灵感参考 [Khet-Setu](https://github.com/rach-kanc/Khet-Setu) 的游戏化农业学习与 [Atmospheric Harvester](https://github.com/feotro23/Atmospheric-Harvester) 的天气驱动玩法，没有复制其源码或资产。场景图片为本项目生成的原创素材。

## 许可

本项目原创源码与场景资产使用 MIT 许可；依赖库与 Open-Meteo 数据分别遵循各自许可及服务条款。
