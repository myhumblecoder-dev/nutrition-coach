# ios/Tools

## GenerateAppIcon.swift

Regenerates `NutritionCoach/Resources/Assets.xcassets/AppIcon.appiconset/icon-1024.png`.

```
swift Tools/GenerateAppIcon.swift NutritionCoach/Resources/Assets.xcassets/AppIcon.appiconset/icon-1024.png
```

The icon is committed, not built — Xcode has no step for this and CI should not
depend on a rasteriser. The script is here so the artwork stays editable rather
than becoming a binary nobody can change.

It draws with CoreGraphics rather than an SVG toolchain because macOS ships no
SVG rasteriser, and it writes with `noneSkipLast` because an app icon carrying
an alpha channel is rejected at upload.
