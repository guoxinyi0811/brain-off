# Voice-assisted editable entry

Implemented for new food records, alongside the existing manual form. No cloud account, LLM, audio storage or new runtime dependency is introduced. Cross-device inventory synchronization remains separate future scope.

## Flow

1. Choose **添加食物**, then expand **语音 / 一句话录入**.
2. Type one sentence, or choose **开始语音** in a supported secure browser. Microphone access is requested only from that explicit click.
3. Read/edit the resulting text, then choose **填入表单**. This replaces the current unsaved form fields with a draft, not a stored inventory record.
4. Check the name, quantity, location and expiration. Resolve any review notices, edit as needed, then choose **保存食物**. Canceling writes nothing.

Examples:

- `三盒牛奶，还有七天，放冷藏第二层`
- `三盒牛奶还有七天放冷藏第二层`
- `牛奶三盒，2026年10月1日生产，保质期一个月`
- `三盒牛奶生产日期是2026年10月19日保质期七天放冷藏第二层`
- `半公斤牛肉`
- `鸡蛋，保质期不知道`

The parser handles one food at a time. Explicit phrases such as 还有、预计还剩、保质期、生产日期是、放在 and 存到 separate continuous speech without requiring recognized commas. Complete date-before-生产 and 生产日期-before-date phrases keep the date together; supported field clauses can change order. Commas remain useful for complex wording. A location-first sentence that runs directly into an unmarked food name is not supported; separate those clauses with a comma.

Quantity prefixes/suffixes accept Arabic/full-width digits, explicit Chinese numbers, decimal weights and common units. It does not change names such as 三文鱼 or 四季豆 into numbers. Ambiguous shorthand such as 一百二, multiple foods, conflicting quantities or unrelated leftover clauses are rejected. This is a deliberately limited rule parser, not general natural-language understanding; the ordinary form remains available. Original applied text is preserved exactly apart from outer whitespace, including whether commas were recognized.

## Dates and locations

Remaining time uses whole days/weeks from the draft's local recording day. A production date requires an explicit four-digit year and a valid calendar date; the duration can use days/weeks/months. A missing year is never inferred. Invalid/future production dates, missing time values, ranges, fractional days, repeated durations and conflicting expiration sources produce a review flag. Common uncertainty phrases such as 可能是、大约 and 好像是 never become a confirmed production date. Production matching must consume a single complete date phrase; date alternatives or extra unexplained text are rejected or remain pending rather than silently taking the first date. A rejected sentence leaves the existing form unchanged. Saving is blocked until the person corrects or explicitly confirms the expiration fields, or deliberately selects automatic estimation.

No expiration input leaves automatic mode selected, using the existing reviewed category rules where applicable. Unsupported categories remain pending. No quantity is invented when none was provided.

Explicit locations match existing configured labels/full paths and must resolve uniquely. Unrecognized/ambiguous locations require a location selection or **确认所选位置**. When there is no explicit location and exactly one purpose-based suggestion, **填入表单** prefills that suggestion for review. Multiple/no suggestions keep the currently selected location. Existing inventory is never moved by recognition or typing, and these matches are not food-safety advice.

## Recognition and privacy

The adapter detects `SpeechRecognition` or `webkitSpeechRecognition`, requests Chinese (`zh-CN`), and uses one noncontinuous session. Only final results populate the editable text. Support is browser-dependent; some browser implementations use an online recognition service. The interface explains that possibility before starting and keeps typed input available. See the [SpeechRecognition reference and compatibility notes](https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition).

No automatic recording, permission grant, retry loop or automatic save occurs. Permission/service/network/no-speech errors keep the existing text. Stop requests the final result; a 30-second capture limit and five-second stop timeout prevent indefinite waiting. Closing/collapsing the editor aborts capture and detaches callbacks; late results cannot overwrite input after disposal. The app itself stores no audio and sends no transcript to an app backend. Browser-service processing is outside the app's control, so offline recognition is not promised.

## Provenance and persistence

The optional `InventoryItem.entry` field records `{ kind: 'speech' | 'text', text, recordedOn }` for the last sentence used to fill a new form. Editing the transcript before applying it records a text-origin draft. Later field edits may differ from that original sentence; the final structured fields remain authoritative. The original sentence can be inspected under **录入原文** when editing.

The source text is validated (nonempty, at most 500 characters, valid recording day), survives later item edits and JSON backup round trips, and is absent from legacy records. No schema migration or invented source is needed for old inventory. Expiration fields retain their existing exact/estimate/production/automatic provenance independently. IndexedDB revision checks still protect the final save; a conflict does not discard the open form.

## Verification and limits

95 automated tests, strict TypeScript and the production build pass. Tests cover punctuation-free speech, reordered explicit clauses, complete manufacturing dates in Arabic/Chinese digits, uncertain/multiple/missing dates, incomplete remaining time and unknown locations. They also cover Chinese/full-width/decimal quantities, one-food rejection, physical-location matching, source validation/backup preservation, native/prefixed detection, permission/network errors, final-result deduplication, disposal/late callbacks, capture timeouts and synchronous service failures. The punctuation and date-alternative regressions were reproduced against the prior parser before the fix. Speech-service tests use a fake recognizer and controlled timers; they do not record microphone audio.

The local Vite endpoint returned HTTP 200. Interactive browser, screenshot and real microphone verification could not run because the host's browser automation kernel failed to initialize (`windows sandbox ... setup refresh had errors`). No microphone permission was granted during development. Device/browser recognition quality and the new page interactions still need a real-browser check; no successful live speech recognition is claimed.
