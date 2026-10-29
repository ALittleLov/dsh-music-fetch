# dsh-music-fetch

把一条音乐单曲分享链接变成一台本机上的音频文件，交给 [`dsh-soundcheck`](https://github.com/ALittleLov/dsh-soundcheck) 分析。

它只做取流这一层：解析链接 → 调第三方接口拿音频地址 → 下载到本地缓存 → 把路径交出去。

## 能取什么

| 渠道 | 依赖项目 | 状态 | 能取什么 |
| --- | --- | --- | --- |
| 网易云 | [api-enhanced](https://github.com/NeteaseCloudMusicApiEnhanced/api-enhanced) | 可用 | 单曲；免费歌匿名，会员歌需要自己的 cookie |
| QQ 音乐 | [qq-music-api](https://github.com/yakult-green-tea/qq-music-api) | 可用 | 免费歌匿名 128k 整首；付费/会员歌需要登录（入口已留，未验证） |
| 酷狗 | [KuGouMusicApi](https://github.com/MakcRe/KuGouMusicApi) | 暂不可用 | 上游取流接口被平台风控（20028），等上游修复 |

只接受单曲链接：歌单、专辑、电台、歌手页、搜索页一律拒绝。

## 安装

需要 Node.js 18+（建议 20+）。

```bash
git clone <this-repo> dsh-music-fetch
cd dsh-music-fetch
npm install
```

`npm install` 会装好网易云解析库和 QQ 音乐服务。酷狗需要单独准备（可选，该渠道当前不可用）：

```bash
npm run setup        # 检查依赖状态
npm run setup:kugou  # 尝试克隆并安装酷狗服务（需要能访问 GitHub）
```

然后把插件目录注册进 DSH 的 profile（`~/.dsh/profiles/<profile>/package.json`）：

```json
{
  "dependencies": {
    "dsh-music-fetch": "link:D:/path/to/dsh-music-fetch"
  },
  "dsh": {
    "profile": {
      "bundles": ["dsh-music-fetch"]
    }
  }
}
```

重启 DSH 后，在设置面板里能看到「Music Fetch」。

## 使用

把单曲分享链接发给模型，它会调用 `music_fetch` 工具：

```text
music_fetch({ link: "https://music.163.com/song?id=..." })
```

返回本地音频的绝对路径，接着调用 `audio_analyze` 分析即可。

设置面板里可以：扫码登录网易云/QQ、查看最近取流、清理缓存。

## 数据与清理

- 凭据只存在本机 `~/.dsh-music-fetch/`，不上传、不进日志。
- 音频下载到 `~/.dsh-music-fetch/audio/`：取流时顺带清理 24 小时前的文件；总容量上限 60 MB，超出时删最旧的。**分析完成后不会立刻删除。**

## 已知限制

- 只做取流，不做播放器的其他功能。
- QQ 音乐付费/会员歌不一定可取；酷狗渠道当前不可用。
- 接口依赖第三方项目，可能随时失效。
- **不提供后续维护。** 失效不保证修复、不保证更新；要继续用可自行升级依赖或换渠道实现。

## 许可与致谢

本插件 MIT。音频解析能力来自上表列出的第三方开源项目，其许可与实现由各自维护者负责。

仅供个人学习、研究与音乐分析使用，请尊重版权；不提供内容分发，不得用于商业用途或侵犯版权的场景。
