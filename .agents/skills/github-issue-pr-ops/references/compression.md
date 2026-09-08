# 圧縮とサイズ確認

GitHub の Issue／PR 添付上限を超える前に、元ファイルを残して別名へ圧縮する。

対応形式とサイズ上限は投稿先のGitHub画面で確認する。圧縮後も文字と操作が読み取れることを確かめる。

## 確認

```bash
file -b --mime-type "$INPUT"
stat -f %z "$INPUT" # macOS
stat -c %s "$INPUT" # Linux
```

## 画像: cwebp

JPEG／PNG を WebP にする。品質とサイズを確認し、元ファイルは上書きしない。

```bash
cwebp -q 82 -m 6 -mt "$INPUT" -o "$OUTPUT.webp"
```

透過を優先する PNG は lossless を使う。

```bash
cwebp -lossless -mt "$INPUT" -o "$OUTPUT.webp"
```

## 動画: ffmpeg

ブラウザ互換性を優先して H.264／AAC の MP4 にする。faststart で再生開始を早める。

```bash
ffmpeg -i "$INPUT" \
  -c:v libx264 -preset medium -crf 26 -pix_fmt yuv420p \
  -movflags +faststart -c:a aac -b:a 128k \
  "$OUTPUT.mp4"
```

大きい映像は 1280px 幅まで縮小する。

```bash
ffmpeg -i "$INPUT" -vf "scale='min(1280,iw)':-2" \
  -c:v libx264 -preset medium -crf 26 -pix_fmt yuv420p \
  -movflags +faststart -c:a aac -b:a 128k \
  "$OUTPUT.mp4"
```

圧縮後にサイズを再確認し、作成した .webp または .mp4 を添付する。
