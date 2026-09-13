# 店内背景・v4

組込みimagegenの編集で、`tablecast-empty-restaurant.png`から端末・スタンド・端末の影を除去。出力は[tablecast-restaurant-background-v4.png](tablecast-restaurant-background-v4.png)。人物は含めない。実画面と端末枠は動画内でHTML/CSSにより合成し、背景画像には焼き込まない。

最終プロンプト:

> Edit target: the supplied empty Japanese restaurant photo. Use case: object-removal. Remove the entire foreground tablet, its bezel, stand, and device-specific shadow, reconstructing the natural oak tabletop and the empty seating behind it. Preserve the image's framing, camera position, realistic photographic lighting, architecture, warm oak and plaster, plant at left, plate/chopsticks at lower right, and water glass at right. The former tablet area must be a clean uninterrupted restaurant background and table surface, with no screen, display, stand, electronic object or replacement prop. This is a clean background plate for compositing an accurately proportioned tablet later. Keep absolutely no people, faces, hands, silhouettes, human reflections, text, logos or watermarks anywhere. No stylistic filters; keep the same natural photographic materials. Wide 16:9.
