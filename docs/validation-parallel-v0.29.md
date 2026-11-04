# v0.29.0 独立安装版验证

新应用包名 `com.fieldletter.farm.next`，显示名称“田野来信·新版”，versionName0.29.0/versionCode30。Java/JNI命名空间保留；Manifest组件使用明确类名，Provider权限以新applicationId为基础。旧应用、旧签名摘要和既有备份格式保持。

- TypeScript351项规则通过（更新器新增5项通道校验）；类型检查与Vite生产构建通过。
- 8项Python签名身份／备份恢复检查通过，包括旧包名拒绝、版本不符、重复元数据、目录边界、重复／链接／穿越归档成员拒绝和私有权限。
- 6项原生更新规则通过，原生更新只接受独立新版APK名；完整Android编译和JUnit以对应CI构建结果为准。
- 用实际旧包名CI产物调用新签名入口，确认在签名前拒绝，不生成输出APK。
- 使用实际v0.28导出代码生成备份，经新版生产网页完成21组迁移检查，页面错误0。v0.27与v0.28相关备份代码相同。
- 原有96组经营、来源、补货和加载检查重新通过，独立新版更新说明另在三个横屏尺寸检查通过；合计120组浏览器检查。页面错误与本地资源请求失败为0。
- 独立签名在本机生成，3072位RSA；仓库仅含GPG AES-256密文和公开证书摘要。加密备份实际解密比对通过；未将私钥、密码、恢复码或私下签名备份上传到公开资源。

2026-11-04已完成发布验证：

- 最终源码与v0.29.0标签均为 `bbffb5b69adc995fa9cb9da36dfdd62aecc427a1`；[Android构建41808569694](https://github.com/schlapiadeziel-rgb/weather-farm-mobile/actions/runs/41808569694)及[发布流程41809361465](https://github.com/schlapiadeziel-rgb/weather-farm-mobile/actions/runs/41809361465)最终均成功。真实签名检查发现并修复了apksigner重复读取同一密码文件的问题，修正后的源码重新构建并签名。
- 公开APK确认包名 `com.fieldletter.farm.next`、版本0.29.0/code30、名称“田野来信·新版”、ARM64及minSDK23；固定新证书、签名前后ZIP载荷、16KB对齐检查通过。
- 从公开下载链接重新下载全部三个附件，文件大小与GitHub元数据一致，APK与源码SHA-256清单均通过；源码ZIP与最终标签的 `git archive` 逐字节一致。
- 实际v0.28旧解析器对真实新发布JSON返回null；新解析器能识别独立APK和清单，校验值与公开APK一致，当前已为0.29.0时不重复提示。v0.27旧解析器亦已通过独立文件名隔离检查。
- 首次发布使用本机固定新签名，再由GitHub Actions核对构建与签名后上传；仓库恢复Secret尚未配置。私下签名备份独立交付，未加入公开附件。临时公开交付分支只含已签名APK和源码提交号，发布后删除。

[独立安装版发布页](https://github.com/schlapiadeziel-rgb/weather-farm-mobile/releases/tag/v0.29.0)的公开附件只有 `field-letter-next.apk`、`weather-farm-next-source.zip`、`SHA256SUMS-next.txt`。

```text
d28973f4802665854cd86771b4bc223711505a75455b8c8a538df67ae248d687  field-letter-next.apk
36dd8f70f4a4064cc0e003b8be54f9fdb48d5ca37ce0d9001036dd386b8b2e71  weather-farm-next-source.zip
```

未执行安卓真机安装／数据迁移、原生模型、相机、GPS、语音、性能或功耗测试。浏览器截图使用隔离备份夹具，不是玩家真实进度或真机照片。
