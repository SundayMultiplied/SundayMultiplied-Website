import assert from "node:assert/strict";
import test from "node:test";

import {
  resolveMidweekDeliveryPreferences,
  validateMidweekV3Html,
} from "../worker/midweek-resource.ts";

const validHtml = `<!doctype html><html><body class="sm-resource sm-midweek"><main class="sm-document">
<section class="sm-section sm-section--summary"><h2>Remember Sunday</h2><p>Jesus calls his people to faithful witness.</p></section>
<section class="sm-section sm-section--scripture"><h2>Return to the Word</h2><p>Philippians 2:14-16</p></section>
<section class="sm-section sm-section--reflection"><h2>Consider</h2><p class="sm-midweek-question">Where is complaint dimming your witness today?</p></section>
<section class="sm-section sm-section--practice"><h2>Respond Today</h2><p>Thank God before voicing your next complaint.</p></section>
<section class="sm-section sm-section--prayer"><h2>Pray</h2><p>Lord, make my life shine with the good news of Jesus.</p></section>
</main></body></html>`;

test("uses church Midweek defaults and accepts package overrides", () => {
  assert.deepEqual(resolveMidweekDeliveryPreferences({ day: "thursday", channel: "push" }), { day: "thursday", channel: "push" });
  assert.deepEqual(resolveMidweekDeliveryPreferences({ day: "thursday", channel: "push" }, "wednesday", "sms"), { day: "wednesday", channel: "sms" });
});

test("accepts a compact Midweek resource with the required reading flow", () => {
  assert.doesNotThrow(() => validateMidweekV3Html(validHtml));
});

test("rejects multiple reflection questions and an out-of-order flow", () => {
  assert.throws(() => validateMidweekV3Html(validHtml.replace("sm-midweek-question\">Where", "sm-midweek-question\">First?</p><p class=\"sm-midweek-question\">Where")), /exactly one central reflection question/);
  const outOfOrder = validHtml.replace(/(<section class="sm-section sm-section--reflection">[\s\S]*?<\/section>)\n(<section class="sm-section sm-section--practice">[\s\S]*?<\/section>)/, "$2\n$1");
  assert.throws(() => validateMidweekV3Html(outOfOrder), /required one-minute reading order/);
});
