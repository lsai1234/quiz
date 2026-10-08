# Is the Meta Pixel working? A plain-English check

Fifteen minutes, a phone and a laptop. No code. Do the steps in order: each
one rules out a different reason Meta might be seeing nothing.

---

## What the site sends Meta, and when

The Pixel only switches on **after a visitor taps OK** on the small
"Cookies for ads?" pill at the top of the screen. That's the law (UK PECR),
not a bug. If someone ignores the pill or taps ✕, Meta hears nothing from
them. Expect Meta to see **fewer people than your own analytics**. That's
normal.

Once someone has tapped OK, these are sent:

| What the visitor does | What Meta receives |
|---|---|
| Opens any page | `PageView` |
| Starts the quiz | `StartQuiz` (custom event) |
| Finishes the quiz | `Lead` |
| Sees their stack | `ViewContent` |
| Enters the giveaway with their email | `CompleteRegistration` |
| Opens a product in the shop | `ViewContent` |
| Adds to basket | `AddToCart` |
| Goes to checkout | `InitiateCheckout` |
| Pays | `Purchase` (with the amount in GBP) |

Meta never receives quiz answers, health answers or email addresses.

---

## Step 1: is it switched on in the Founders Hub?

1. Founders Hub → **Settings → Meta Pixel**.
2. **Pixel ID** should be a long number (15–16 digits). Copy it.
3. Open Meta **Events Manager** (business.facebook.com/events_manager). Pick
   your Pixel on the left. The number under its name must match exactly.
4. **Send events to Meta** must be ticked. Press **Save**.

If the numbers don't match, that's the whole problem: events are going to a
different Pixel.

## Step 2: watch events arrive live (the definitive test)

1. In Events Manager, open your Pixel and click **Test events**.
2. Under "Test browser events", type `https://getchrgd.co.uk` and click
   **Open website**. That opens the site in a new tab linked to the test.
   Do this on a laptop.
3. In the site tab, wait about 6 seconds for **"Cookies for ads?"**, then
   tap **OK**.
   - **Pill never appears?** Your browser is sending "Do Not Track" or
     "Global Privacy Control", or you opted out of analytics on the privacy
     page before. The site honours that and never asks. Try a normal Chrome
     window with no privacy extensions. Brave and Firefox strict mode block
     this.
   - **Tapped ✕ by mistake?** That's remembered. Open a private/incognito
     window and start again.
4. Back in Test events you should see, within about 30 seconds:
   - **PageView**
5. Take the quiz to the end. You should see **StartQuiz**, then **Lead**,
   then **ViewContent**.
6. At the bottom of your results, enter the giveaway → **CompleteRegistration**.
7. Add to basket and start checkout → **AddToCart**, **InitiateCheckout**.

If all of these show up, the Pixel is working end to end.

## Step 3: check a real purchase

Purchase only fires after a real payment confirms, on the order confirmation
page.

1. Do Step 2 again, but buy something cheap (or use a 100% founder code).
2. After paying you land back on the confirmation page. Test events should
   show **Purchase** with a value and `GBP`.
3. Refund it in Stripe afterwards.

Until this fix, a Purchase could be lost on that page, because it fired
before the site had finished loading which Pixel to use. That is now fixed.

## Step 4: check without Test events (Pixel Helper)

1. Install the **Meta Pixel Helper** Chrome extension.
2. Visit the site, tap **OK** on the cookie pill.
3. Click the extension icon. It should list your Pixel ID with a green tick
   and the events above as you go through the quiz.
4. Before you tap OK, the helper should show **no Pixel**. That's the
   consent working, not a fault.

## Step 5: is the data reaching ads?

In Events Manager → **Overview**, events show up 20 minutes to a few hours
after they happen. To optimise a campaign for quiz completions, pick
**Lead** as the conversion event. For sales, pick **Purchase**.

---

## If something's still missing

| Symptom | Likely cause |
|---|---|
| Nothing at all in Test events | Pixel ID mismatch (Step 1), "Send events to Meta" unticked, or an ad blocker in the browser you tested with |
| PageView shows, nothing else | You didn't go far enough. StartQuiz needs a tap on a quiz button |
| Events in Test events but none in Overview | Normal for the first few hours; check again tomorrow |
| Far fewer events than visitors | Expected: only people who tap OK are counted. iPhone users who opted out of tracking and ad-blocker users aren't counted either |
| Two PageViews per page | Fixed in this change. Re-test after deploy |

**Getting closer to all your sales:** the bigger fix for undercounting is
Meta's **Conversions API**, which sends Purchase from our server as well as
the browser. The code already tags each Purchase with the order ID so Meta can
de-duplicate the two. It's a separate piece of work and needs a Meta access
token, so it isn't in this change.
