# Landing page media

All paths are referenced from `frontend/src/data/landing.ts`. Replace a file with one of the same name, or change the path there. After replacing a past or gallery photo, run `npm --prefix frontend run media:prepare` to rebuild its `-480.jpg` phone copy.

| Folder | Files | Used by | Size |
|---|---|---|---|
| `past/` | `past-1…6.jpg` + `-480.jpg` phone copies | Past events bento grid | 900×1100 (480 wide) |
| `past/` | `<event-slug>.jpg` + `.webp`, `-480`, `-blur.webp` | Event cover photos (`events.image_url`): event cards, event page, landing grid. Credits in `past/CREDITS.md` | 1600 wide, ~200 KB |
| `gallery/` | `moment-1…12.jpg` + `-480.jpg` phone copies | Gallery marquee and lightbox | 720×540 (480 wide) |
| `merch/` | `tshirt.jpg`, `bag.jpg`, `bottle.jpg`, `stickers.jpg` | Merch posters and mobile cards | 640×800 |
| `merch/` | `tshirt.mp4`, `bag.mp4`, `bottle.mp4`, `stickers.mp4` | Cursor-follow preview (mouse) and inline card video (touch); not shipped yet | 640×800, muted loop |

Upcoming events have no photos (the events haven't happened). An admin can set any event's photo under Events → Edit → Cover photo. To add one: put the original in a folder, run `npm --prefix frontend run photos:prepare -- <folder>`, then use `/media/past/<name>.jpg` and credit it in `past/CREDITS.md`.

## Sources

Past-event and gallery photos are stand-ins from Unsplash under the Unsplash License (free to use, attribution not required): https://unsplash.com/license. Replace them with the club's own photos when available.

- past-1 ZbiLAi2BtiU · past-2 LtE6W_JVTGc · past-3 tqe1jIgyhhs · past-4 mbGBTpCi5qQ · past-5 2uX_7L_10rM · past-6 FQqRVH1EVjg
- moment-1 QmsOdBXr1Zs · 2 E1KaiX_Gtrs · 3 fT7TgUqIf4Y · 4 8tXYV47AABY · 5 zYb_ZEh1pM8 · 6 TGDZIYXatJk · 7 SPO0ST4nVbY · 8 vAtawkTGZKo · 9 uv4h7wIQcHQ · 10 _HzlOHmboSk · 11 w1s5H_3Zn48 · 12 xisPXJqwQkA

Each id is the photo page `https://unsplash.com/photos/<id>`. Merch images are the club's own product mockups.
