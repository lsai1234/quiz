/**
 * The exercise and activity library: every movement a plan can hold, and every
 * word a member reads about it.
 *
 * DRAFT for coach review. A qualified coach reads all of it (it is in the
 * review pack, `trainingLibraryRows`) before the plan is switched on for
 * customers (Settings → Offer → Box services → Training plan).
 *
 * The words are about doing the movement well: steps, what to think about,
 * common mistakes, tips. Never what it does for anyone's health, and never
 * rehab: `loads` is only used to leave a movement out for someone working
 * around an area.
 *
 * Tutorial videos are not here: founders add them in the Founders Hub
 * (`./tutorials`), by id.
 */
import type { Activity, ActivityKind, Area, Equipment, Exercise, Muscle, Pattern, Role, Unit } from './types'

const BW: Equipment[] = ['bodyweight', 'home', 'gym']
const HOME: Equipment[] = ['home', 'gym']
const GYM: Equipment[] = ['gym']

type Words = Pick<Exercise, 'steps' | 'cues' | 'mistakes' | 'tips'>

function ex(
  id: string,
  name: string,
  pattern: Pattern,
  role: Role,
  muscles: Muscle[],
  equipment: Equipment[],
  kit: string,
  loads: Area[],
  level: 1 | 2 | 3,
  unit: Unit,
  words: Words,
  ladder: { easier?: string; harder?: string } = {},
): Exercise {
  return { id, name, pattern, role, muscles, equipment, kit, loads, level, unit, ...words, ...ladder }
}

export const EXERCISES: Exercise[] = [
  /* ── Squat ── */
  ex('box-squat', 'Box squat', 'squat', 'compound', ['quads', 'glutes'], BW, 'A chair, box or bench', ['knees'], 1, 'reps', {
    steps: ['Stand in front of a box or chair, feet shoulder-width apart.', 'Sit back until you lightly touch the box.', 'Pause for a moment without relaxing.', 'Stand back up by driving through your heels.'],
    cues: ['Touch, don’t flop.', 'Keep your chest up.'],
    mistakes: ['Dropping onto the box.', 'Rocking forward to stand.'],
    tips: ['Use a lower box as you get comfortable.', 'Hold a weight at your chest to make it harder.'],
  }, { harder: 'bodyweight-squat' }),
  ex('bodyweight-squat', 'Bodyweight squat', 'squat', 'compound', ['quads', 'glutes'], BW, 'No kit', ['knees'], 1, 'reps', {
    steps: ['Stand with feet about shoulder-width apart, toes turned out slightly.', 'Sit your hips back and down as if onto a low chair, arms forward for balance.', 'Go as low as you can while your heels stay down and your chest stays up.', 'Push the floor away to stand tall.'],
    cues: ['Knees follow your toes.', 'Weight through the whole foot.', 'Chest proud.'],
    mistakes: ['Heels lifting off the floor.', 'Knees caving in on the way up.'],
    tips: ['Squat to a chair first if the depth feels shaky.', 'Breathe in on the way down, out on the way up.'],
  }, { easier: 'box-squat', harder: 'goblet-squat' }),
  ex('goblet-squat', 'Goblet squat', 'squat', 'compound', ['quads', 'glutes', 'core'], HOME, 'A dumbbell or kettlebell', ['knees'], 1, 'reps', {
    steps: ['Hold one dumbbell upright at your chest, elbows under it.', 'Stand with feet shoulder-width apart, toes out slightly.', 'Squat down between your knees, keeping the weight close.', 'Drive up through your whole foot.'],
    cues: ['Elbows inside your knees at the bottom.', 'Stay tall through your upper back.'],
    mistakes: ['Letting the weight pull you forward.', 'Cutting the depth short.'],
    tips: ['A great first loaded squat: the weight in front helps you sit upright.', 'Pause for a second at the bottom to own the position.'],
  }, { easier: 'bodyweight-squat', harder: 'back-squat' }),
  ex('leg-press', 'Leg press', 'squat', 'compound', ['quads', 'glutes'], GYM, 'A leg press machine', ['knees'], 1, 'reps', {
    steps: ['Sit with your back flat on the pad, feet hip-width in the middle of the platform.', 'Release the safety and lower the platform until your knees are bent to about 90 degrees.', 'Press back up without locking your knees.', 'Put the safety back on when you finish.'],
    cues: ['Lower back stays on the pad.', 'Press through your heels.'],
    mistakes: ['Lowering so far your hips curl off the seat.', 'Snapping your knees straight at the top.'],
    tips: ['Feet higher on the platform works your glutes more; lower works your quads more.'],
  }),
  ex('back-squat', 'Barbell back squat', 'squat', 'compound', ['quads', 'glutes', 'core'], GYM, 'A barbell and squat rack', ['knees', 'lower-back'], 2, 'reps', {
    steps: ['Set the bar in the rack at chest height and step under it, resting it across your upper back.', 'Grip the bar just outside your shoulders, stand up and take two steps back.', 'Brace your middle, then sit down and back until your hips are at least level with your knees.', 'Drive up, keeping the bar over the middle of your foot.'],
    cues: ['Big breath and brace before each rep.', 'Spread the floor with your feet.', 'Bar travels straight up and down.'],
    mistakes: ['Rounding your lower back at the bottom.', 'Hips shooting up first out of the bottom.'],
    tips: ['Set the safety bars just below your lowest point.', 'Add weight in small steps and leave a rep or two in the tank.'],
  }, { easier: 'goblet-squat', harder: 'front-squat' }),
  ex('front-squat', 'Front squat', 'squat', 'compound', ['quads', 'glutes', 'core'], GYM, 'A barbell and squat rack', ['knees', 'wrists'], 3, 'reps', {
    steps: ['Rest the bar on the front of your shoulders, fingertips under it, elbows high.', 'Step back, feet shoulder-width apart.', 'Squat straight down, keeping your elbows up and your body upright.', 'Stand up, leading with your elbows.'],
    cues: ['Elbows high the whole way.', 'Sit down between your heels.'],
    mistakes: ['Elbows dropping so the bar rolls forward.', 'Gripping the bar tightly with the whole hand.'],
    tips: ['Two fingers under the bar is enough.', 'Crossed arms work if the rack position is awkward.'],
  }, { easier: 'back-squat' }),
  ex('wall-sit', 'Wall sit', 'squat', 'accessory', ['quads'], BW, 'A wall', ['knees'], 1, 'seconds', {
    steps: ['Lean your back flat against a wall.', 'Walk your feet out and slide down until your knees are bent to about 90 degrees.', 'Hold, breathing steadily.', 'Slide back up to finish.'],
    cues: ['Knees over ankles.', 'Back flat on the wall.'],
    mistakes: ['Holding your breath.', 'Resting your hands on your thighs.'],
    tips: ['Go less deep to make it easier.', 'Count slow breaths rather than watching the clock.'],
  }),

  /* ── Hinge ── */
  ex('bw-good-morning', 'Bodyweight good morning', 'hinge', 'compound', ['hamstrings', 'glutes'], BW, 'No kit', ['lower-back'], 1, 'reps', {
    steps: ['Stand with feet hip-width apart, hands lightly on your head or across your chest.', 'Soften your knees and push your hips back, tipping your chest forward.', 'Stop when you feel a stretch in your hamstrings, back still flat.', 'Drive your hips forward to stand.'],
    cues: ['Hips back, as if closing a drawer with them.', 'Neck in line with your back.'],
    mistakes: ['Rounding your back.', 'Turning it into a squat.'],
    tips: ['Practise against a wall: stand a foot away and reach your hips back to touch it.'],
  }, { harder: 'romanian-deadlift' }),
  ex('single-leg-rdl', 'Single-leg Romanian deadlift', 'hinge', 'compound', ['hamstrings', 'glutes'], BW, 'No kit (a dumbbell makes it harder)', ['lower-back', 'ankles'], 2, 'reps', {
    steps: ['Stand on one leg with a soft bend in that knee.', 'Hinge forward, letting the other leg reach straight back.', 'Lower until your body and back leg are close to level with the floor.', 'Return to standing; finish the reps, then switch legs.'],
    cues: ['Hips level, back toes pointing down.', 'Reach long through the back heel.'],
    mistakes: ['Hips twisting open.', 'Rushing and wobbling.'],
    tips: ['Lightly touch a wall for balance at first.'],
  }),
  ex('romanian-deadlift', 'Romanian deadlift', 'hinge', 'compound', ['hamstrings', 'glutes', 'back'], HOME, 'Dumbbells or a barbell', ['lower-back'], 2, 'reps', {
    steps: ['Stand tall holding the weights in front of your thighs, feet hip-width apart.', 'Soften your knees, then push your hips back, sliding the weights down your legs.', 'Lower until you feel a stretch in your hamstrings, usually just below the knee.', 'Squeeze your glutes to bring your hips forward and stand tall.'],
    cues: ['Hips back, not down.', 'Weights stay close to your legs.', 'Long, flat back.'],
    mistakes: ['Bending your knees into a squat.', 'Rounding your back to reach lower.'],
    tips: ['Imagine closing a car door with your bum.', 'Take about three seconds on the way down.'],
  }, { easier: 'bw-good-morning', harder: 'trap-bar-deadlift' }),
  ex('kettlebell-swing', 'Kettlebell swing', 'hinge', 'compound', ['glutes', 'hamstrings', 'core'], HOME, 'A kettlebell', ['lower-back'], 2, 'reps', {
    steps: ['Stand with feet a little wider than your hips, the kettlebell a foot in front of you.', 'Hinge to grip it and hike it back between your legs.', 'Snap your hips forward to swing it to chest height.', 'Let it fall back between your legs, hinging, and go again.'],
    cues: ['It’s a hip snap, not a front raise.', 'Stand like a plank at the top: glutes and stomach tight.'],
    mistakes: ['Squatting the swing.', 'Lifting the bell with your arms.'],
    tips: ['Start lighter than you think.', 'Breathe out sharply at the top of each swing.'],
  }),
  ex('back-extension', 'Back extension', 'hinge', 'accessory', ['back', 'glutes', 'hamstrings'], GYM, 'A back extension bench', ['lower-back'], 1, 'reps', {
    steps: ['Set the pad just below your hip bones and hook your heels.', 'Cross your arms on your chest.', 'Lower your chest by hinging at the hips.', 'Rise until your body is in a straight line, and no further.'],
    cues: ['Squeeze your glutes to come up.', 'Stop at straight.'],
    mistakes: ['Arching up past straight.', 'Rushing the bottom.'],
    tips: ['Hold a plate at your chest to make it harder.'],
  }),
  ex('trap-bar-deadlift', 'Trap bar deadlift', 'hinge', 'compound', ['quads', 'glutes', 'back'], GYM, 'A trap (hex) bar', ['lower-back'], 2, 'reps', {
    steps: ['Step inside the bar, feet hip-width apart.', 'Hinge and bend your knees to grip the handles at your sides.', 'Chest up, back flat, brace your middle.', 'Stand up by pushing the floor away, then lower under control.'],
    cues: ['Stand up tall; don’t lean back.', 'Your arms are hooks: let your legs do it.'],
    mistakes: ['Rounding your back to reach the handles.', 'Bouncing the plates off the floor.'],
    tips: ['Use the high handles if reaching the low ones is hard.', 'A friendly way into deadlifting before the straight bar.'],
  }, { easier: 'romanian-deadlift', harder: 'deadlift' }),
  ex('deadlift', 'Barbell deadlift', 'hinge', 'compound', ['back', 'glutes', 'hamstrings'], GYM, 'A barbell and plates', ['lower-back'], 3, 'reps', {
    steps: ['Stand with the bar over the middle of your feet, feet hip-width apart.', 'Hinge down and grip the bar just outside your legs.', 'Drop your hips until your shins touch the bar: chest up, back flat.', 'Brace and push the floor away, standing tall with the bar close; lower it the same way.'],
    cues: ['Pull the slack out of the bar before you lift.', 'The bar drags up your legs.', 'Push the floor away.'],
    mistakes: ['Hips rising before the bar leaves the floor.', 'Leaning back at the top.'],
    tips: ['Reset each rep from the floor while you learn.', 'Chalk or straps help when your grip gives out before your legs.'],
  }, { easier: 'trap-bar-deadlift' }),

  /* ── Lunge ── */
  ex('split-squat', 'Split squat', 'lunge', 'compound', ['quads', 'glutes'], BW, 'No kit', ['knees'], 1, 'reps', {
    steps: ['Take a long step forward and stay there, back heel up.', 'Lower straight down until your back knee nearly touches the floor.', 'Drive up through your front foot.', 'Finish the reps, then switch legs.'],
    cues: ['Straight down, straight up, like a lift.', 'Most of your weight on the front foot.'],
    mistakes: ['Leaning forward over the front knee.', 'Feet on a tightrope: keep them hip-width apart.'],
    tips: ['A folded towel under the back knee helps you judge the bottom.'],
  }, { harder: 'bulgarian-split-squat' }),
  ex('reverse-lunge', 'Reverse lunge', 'lunge', 'compound', ['quads', 'glutes'], BW, 'No kit (dumbbells make it harder)', ['knees'], 1, 'reps', {
    steps: ['Stand tall, feet hip-width apart.', 'Step one foot back and lower until both knees are bent to about 90 degrees.', 'Push through your front heel to step back up.', 'Alternate legs, or finish one side first.'],
    cues: ['Front knee over the middle of your foot.', 'Stay tall.'],
    mistakes: ['Front knee caving in.', 'Steps so short your front heel lifts.'],
    tips: ['Stepping back is easier to balance than stepping forward.', 'Hold on to something for balance at first.'],
  }, { easier: 'split-squat', harder: 'walking-lunge' }),
  ex('step-up', 'Step-up', 'lunge', 'compound', ['quads', 'glutes'], BW, 'A sturdy step, box or bench', ['knees'], 1, 'reps', {
    steps: ['Stand facing a sturdy step at knee height or lower.', 'Put your whole foot on it.', 'Drive through that foot to stand up on the step.', 'Step down under control; finish the reps, then switch legs.'],
    cues: ['Let the top leg do the work, not a push from below.', 'Stand tall at the top.'],
    mistakes: ['Pushing off the back foot.', 'A step so high your hips tip.'],
    tips: ['Hold dumbbells at your sides to make it harder.'],
  }),
  ex('walking-lunge', 'Walking lunge', 'lunge', 'compound', ['quads', 'glutes'], HOME, 'Dumbbells (optional)', ['knees'], 2, 'reps', {
    steps: ['Hold dumbbells at your sides, or none at first.', 'Step forward into a lunge, back knee just above the floor.', 'Push through your front foot and bring the back foot forward into the next step.', 'Keep walking, alternating legs.'],
    cues: ['Long steps, chest up.', 'Control every step.'],
    mistakes: ['Short, choppy steps.', 'Front knee rolling inward.'],
    tips: ['Count the reps on each leg.'],
  }, { easier: 'reverse-lunge' }),
  ex('bulgarian-split-squat', 'Bulgarian split squat', 'lunge', 'compound', ['quads', 'glutes'], BW, 'A bench or chair (dumbbells make it harder)', ['knees'], 2, 'reps', {
    steps: ['Stand a stride in front of a bench, facing away, and rest the top of one foot on it.', 'Lower straight down until your front thigh is about level with the floor.', 'Drive up through your front foot.', 'Finish the reps, then switch legs.'],
    cues: ['Most of your weight on the front leg.', 'A slight forward lean is fine.'],
    mistakes: ['Standing too close to the bench.', 'Bouncing at the bottom.'],
    tips: ['Find your foot position with a few bodyweight reps before adding weight.'],
  }, { easier: 'split-squat' }),

  /* ── Glutes and calves ── */
  ex('glute-bridge', 'Glute bridge', 'glute', 'accessory', ['glutes', 'hamstrings'], BW, 'No kit', [], 1, 'reps', {
    steps: ['Lie on your back, knees bent, feet flat and hip-width apart.', 'Press through your heels to lift your hips.', 'Squeeze your glutes at the top, body straight from knees to shoulders.', 'Lower slowly.'],
    cues: ['Ribs down; don’t arch.', 'Squeeze for a second at the top.'],
    mistakes: ['Pushing through your toes.', 'Over-arching your lower back at the top.'],
    tips: ['A band just above your knees makes your glutes work harder.'],
  }, { harder: 'single-leg-glute-bridge' }),
  ex('single-leg-glute-bridge', 'Single-leg glute bridge', 'glute', 'accessory', ['glutes', 'hamstrings'], BW, 'No kit', [], 2, 'reps', {
    steps: ['Lie on your back with one foot flat and the other leg straight up.', 'Press through the planted heel to lift your hips.', 'Keep your hips level at the top.', 'Lower slowly; finish the reps, then switch.'],
    cues: ['Hips stay square.', 'Drive through the heel.'],
    mistakes: ['One hip dropping.', 'Rushing.'],
    tips: ['Pause at the top for two seconds.'],
  }, { easier: 'glute-bridge', harder: 'hip-thrust' }),
  ex('hip-thrust', 'Hip thrust', 'glute', 'accessory', ['glutes', 'hamstrings'], HOME, 'A bench or sofa edge, and a weight', [], 2, 'reps', {
    steps: ['Sit on the floor with your upper back against a bench and a weight across your hips.', 'Feet flat, about hip-width apart, knees bent.', 'Drive through your heels to lift your hips until your body is flat from knees to shoulders.', 'Lower under control.'],
    cues: ['Chin tucked, eyes forward.', 'Shins upright at the top.'],
    mistakes: ['Arching your back to get higher.', 'Feet too far away.'],
    tips: ['Pad the bar with a towel or a pad.'],
  }, { easier: 'glute-bridge' }),
  ex('calf-raise', 'Calf raise', 'calf', 'accessory', ['calves'], BW, 'A step (optional)', ['ankles'], 1, 'reps', {
    steps: ['Stand on the edge of a step with your heels hanging off, holding something for balance.', 'Rise up onto your toes as high as you can.', 'Pause at the top.', 'Lower your heels slowly below the step.'],
    cues: ['Full height, full stretch.', 'Take two or three seconds on the way down.'],
    mistakes: ['Bouncing.', 'Only doing half the range.'],
    tips: ['One leg at a time makes it much harder.', 'Hold a dumbbell to add load.'],
  }),

  /* ── Horizontal push ── */
  ex('incline-push-up', 'Incline push-up', 'push-h', 'compound', ['chest', 'triceps', 'shoulders'], BW, 'A bench, table or wall', ['wrists'], 1, 'reps', {
    steps: ['Put your hands on the edge of a bench or table, a bit wider than your shoulders.', 'Walk your feet back so your body is straight from head to heels.', 'Lower your chest to the edge.', 'Press back up.'],
    cues: ['Your body moves as one plank.', 'Elbows about 45 degrees from your body.'],
    mistakes: ['Hips sagging.', 'Elbows flaring straight out.'],
    tips: ['The higher the surface, the easier it is: go lower over the weeks.'],
  }, { harder: 'push-up' }),
  ex('push-up', 'Push-up', 'push-h', 'compound', ['chest', 'triceps', 'shoulders'], BW, 'No kit', ['wrists', 'shoulders'], 2, 'reps', {
    steps: ['Hands on the floor a bit wider than your shoulders, body straight from head to heels.', 'Lower until your chest is a fist from the floor.', 'Press the floor away to straighten your arms.', 'Keep your body in one line throughout.'],
    cues: ['Squeeze your glutes and stomach.', 'Screw your hands into the floor.'],
    mistakes: ['Head poking forward.', 'Hips sagging or piking up.'],
    tips: ['Can’t press up from the bottom yet? Lower slowly, then put your knees down to press up.'],
  }, { easier: 'incline-push-up' }),
  ex('floor-press', 'Dumbbell floor press', 'push-h', 'compound', ['chest', 'triceps'], HOME, 'Dumbbells', ['shoulders'], 1, 'reps', {
    steps: ['Lie on your back, knees bent, a dumbbell in each hand above your chest.', 'Lower until your upper arms touch the floor.', 'Pause, then press back up.', 'Bring the weights over your chest at the top.'],
    cues: ['Elbows about 45 degrees from your body.', 'Pause on the floor; don’t bounce.'],
    mistakes: ['Letting your elbows crash down.', 'Pressing the weights out wide.'],
    tips: ['The floor sets your depth, which makes it a good press when there’s no bench.'],
  }, { harder: 'db-bench-press' }),
  ex('chest-press-machine', 'Chest press machine', 'push-h', 'compound', ['chest', 'triceps'], GYM, 'A chest press machine', ['shoulders'], 1, 'reps', {
    steps: ['Set the seat so the handles line up with the middle of your chest.', 'Grip and press forward until your arms are nearly straight.', 'Return slowly until you feel a stretch.', 'Keep your back against the pad.'],
    cues: ['Shoulder blades back.', 'Smooth, steady reps.'],
    mistakes: ['Seat too low or too high.', 'Letting the stack slam.'],
    tips: ['A good way to learn pressing before free weights.'],
  }, { harder: 'db-bench-press' }),
  ex('db-bench-press', 'Dumbbell bench press', 'push-h', 'compound', ['chest', 'triceps', 'shoulders'], GYM, 'Dumbbells and a bench', ['shoulders'], 1, 'reps', {
    steps: ['Sit on a flat bench with the dumbbells on your knees, then lie back, bringing them up over your chest.', 'Lower them to the sides of your chest.', 'Press up and slightly in.', 'Keep your feet flat on the floor throughout.'],
    cues: ['Shoulder blades squeezed together and down.', 'Wrists stacked over elbows.'],
    mistakes: ['Bouncing at the bottom.', 'Lifting your hips off the bench.'],
    tips: ['Kick the dumbbells up with your knees as you lie back, and the same to finish.'],
  }, { easier: 'floor-press', harder: 'bench-press' }),
  ex('incline-db-press', 'Incline dumbbell press', 'push-h', 'compound', ['chest', 'shoulders', 'triceps'], GYM, 'Dumbbells and an adjustable bench', ['shoulders'], 2, 'reps', {
    steps: ['Set a bench to a low incline, around 30 degrees.', 'Lie back with the dumbbells over your upper chest.', 'Lower them to the sides of your upper chest.', 'Press up and slightly in.'],
    cues: ['A low incline, not a shoulder press.', 'Control the way down.'],
    mistakes: ['Setting the incline too steep.', 'Arching off the bench.'],
    tips: ['Pairs well after a flat press.'],
  }),
  ex('bench-press', 'Barbell bench press', 'push-h', 'compound', ['chest', 'triceps', 'shoulders'], GYM, 'A barbell and a bench with safeties', ['shoulders', 'wrists'], 2, 'reps', {
    steps: ['Lie with your eyes under the bar, feet flat on the floor.', 'Grip a bit wider than your shoulders, squeeze your shoulder blades together and lift the bar out.', 'Lower the bar to your lower chest.', 'Press back up over your shoulders.'],
    cues: ['Try to bend the bar: elbows tucked a little.', 'Drive your feet into the floor.'],
    mistakes: ['Bouncing the bar off your chest.', 'Wrists bent back.'],
    tips: ['Set the safeties, or have a spotter for heavy sets.'],
  }, { easier: 'db-bench-press' }),

  /* ── Vertical push ── */
  ex('pike-push-up', 'Pike push-up', 'push-v', 'compound', ['shoulders', 'triceps'], BW, 'No kit', ['shoulders', 'wrists'], 2, 'reps', {
    steps: ['Start in a push-up position, then walk your feet in and lift your hips high into an upside-down V.', 'Bend your elbows to lower the top of your head toward the floor in front of your hands.', 'Press back up.', 'Keep your hips high throughout.'],
    cues: ['Your head and hands make a triangle.', 'Elbows back, not out.'],
    mistakes: ['Dropping your hips into a normal push-up.', 'Rushing.'],
    tips: ['Feet on a step makes it harder.'],
  }),
  ex('db-shoulder-press', 'Dumbbell shoulder press', 'push-v', 'compound', ['shoulders', 'triceps'], HOME, 'Dumbbells', ['shoulders'], 1, 'reps', {
    steps: ['Sit or stand tall with the dumbbells at shoulder height, palms forward.', 'Press overhead until your arms are straight.', 'Lower back to your shoulders.', 'Keep your ribs down throughout.'],
    cues: ['Squeeze your glutes if you’re standing.', 'Biceps finish by your ears.'],
    mistakes: ['Leaning back to finish the rep.', 'Clashing the weights at the top.'],
    tips: ['Sitting with back support makes it easier to stay strict.'],
  }, { harder: 'overhead-press' }),
  ex('landmine-press', 'Landmine press', 'push-v', 'compound', ['shoulders', 'chest', 'core'], GYM, 'A barbell in a landmine or a corner', ['shoulders'], 2, 'reps', {
    steps: ['Hold the end of the bar at your shoulder with one hand, standing in a split stance.', 'Press up and forward until your arm is straight.', 'Lower under control.', 'Finish one side, then switch.'],
    cues: ['Ribs down, glutes tight.', 'Reach at the top.'],
    mistakes: ['Twisting your body to press.', 'Shrugging.'],
    tips: ['An angled press: a good one to have when straight overhead pressing feels awkward.'],
  }),
  ex('overhead-press', 'Barbell overhead press', 'push-v', 'compound', ['shoulders', 'triceps', 'core'], GYM, 'A barbell and rack', ['shoulders', 'lower-back'], 2, 'reps', {
    steps: ['Take the bar from the rack at collarbone height, hands just outside your shoulders.', 'Brace your middle and squeeze your glutes.', 'Press straight up, moving your head back and then through as the bar passes.', 'Lower to your collarbone.'],
    cues: ['Bar over the middle of your foot at the top.', 'Stand like a plank.'],
    mistakes: ['Leaning back into a standing bench press.', 'The bar drifting forward.'],
    tips: ['Use small jumps in weight: this lift moves slowly.'],
  }, { easier: 'db-shoulder-press' }),

  /* ── Horizontal pull ── */
  ex('doorframe-row', 'Doorframe row', 'pull-h', 'compound', ['back', 'biceps'], BW, 'A sturdy doorframe', [], 1, 'reps', {
    steps: ['Stand in a doorway and hold both sides of the frame at chest height.', 'Walk your feet in and lean back until your arms are straight.', 'Pull your chest toward the frame, squeezing your shoulder blades.', 'Lower back slowly.'],
    cues: ['Body straight from head to heels.', 'Lead with your elbows.'],
    mistakes: ['Bending at the hips.', 'Losing tension at the bottom.'],
    tips: ['Check the frame is solid first.', 'Feet closer to the frame makes it harder.'],
  }),
  ex('band-row', 'Band row', 'pull-h', 'compound', ['back', 'biceps'], HOME, 'A resistance band', [], 1, 'reps', {
    steps: ['Anchor a band at chest height, in a door or round a post.', 'Hold the ends and step back until there’s tension.', 'Row your hands to your ribs, squeezing your shoulder blades.', 'Return slowly.'],
    cues: ['Stand tall.', 'Slow on the way back.'],
    mistakes: ['Leaning back to make it easier.', 'Shrugging.'],
    tips: ['Step further from the anchor to make it harder.'],
  }),
  ex('db-row', 'One-arm dumbbell row', 'pull-h', 'compound', ['back', 'biceps'], HOME, 'A dumbbell and a bench or chair', [], 1, 'reps', {
    steps: ['Put one hand and knee on a bench, or one hand on a chair with your feet split.', 'Hold a dumbbell in the other hand, arm long.', 'Row it to your hip, elbow close to your side.', 'Lower until your arm is straight; finish the side, then switch.'],
    cues: ['Pull your elbow to your back pocket.', 'Flat back, still body.'],
    mistakes: ['Twisting to heave the weight.', 'Shrugging toward your ear.'],
    tips: ['Pause for a second at the top.'],
  }),
  ex('seated-cable-row', 'Seated cable row', 'pull-h', 'compound', ['back', 'biceps'], GYM, 'A cable row station', [], 1, 'reps', {
    steps: ['Sit with your feet on the platform, knees soft, holding the handle.', 'Sit tall, arms long.', 'Row the handle to your stomach, squeezing your shoulder blades together.', 'Return slowly until your arms are straight.'],
    cues: ['Chest up, shoulders down.', 'Lead with your elbows.'],
    mistakes: ['Rocking back and forth.', 'Rounding forward at the stretch.'],
    tips: ['Try a different handle every few weeks for variety.'],
  }),
  ex('chest-supported-row', 'Chest-supported row', 'pull-h', 'compound', ['back', 'biceps'], GYM, 'Dumbbells and an incline bench', [], 1, 'reps', {
    steps: ['Set a bench at an incline and lie chest-down, dumbbells hanging.', 'Row both dumbbells up, elbows toward your hips.', 'Squeeze your shoulder blades.', 'Lower slowly.'],
    cues: ['Chest stays on the pad.', 'Lead with the elbows.'],
    mistakes: ['Lifting your chest off the pad.', 'Shrugging.'],
    tips: ['The bench holds you still, so all the effort goes into your back.'],
  }),
  ex('inverted-row', 'Inverted row', 'pull-h', 'compound', ['back', 'biceps'], GYM, 'A bar in a rack or Smith machine', [], 2, 'reps', {
    steps: ['Set a bar at about waist height and hang underneath, hands just wider than your shoulders.', 'Walk your feet out so your body is straight, heels on the floor.', 'Pull your chest to the bar.', 'Lower until your arms are straight.'],
    cues: ['Your body stays one plank.', 'Squeeze your shoulder blades at the top.'],
    mistakes: ['Hips sagging.', 'Craning your neck to the bar.'],
    tips: ['Bend your knees to make it easier; raise your feet to make it harder.'],
  }),
  ex('barbell-row', 'Barbell row', 'pull-h', 'compound', ['back', 'biceps'], GYM, 'A barbell', ['lower-back'], 2, 'reps', {
    steps: ['Hold the bar with an overhand grip just outside your knees.', 'Hinge until your body is at around 45 degrees, back flat.', 'Row the bar to your lower ribs.', 'Lower under control.'],
    cues: ['Your body stays still; the bar moves.', 'Elbows back.'],
    mistakes: ['Standing up as you row.', 'Rounding your back.'],
    tips: ['Swap to a chest-supported row on days your lower back wants a rest.'],
  }),

  /* ── Vertical pull ── */
  ex('band-pulldown', 'Band pulldown', 'pull-v', 'compound', ['back', 'biceps'], HOME, 'A resistance band and a high anchor', [], 1, 'reps', {
    steps: ['Anchor a band high, such as over the top of a door.', 'Kneel facing it, arms up holding the ends.', 'Pull your elbows down to your sides.', 'Return slowly.'],
    cues: ['Squeeze your shoulder blades down.', 'Stay tall.'],
    mistakes: ['Bending forward to help.', 'Letting the band snap back.'],
    tips: ['Kneel further back for more tension.'],
  }),
  ex('lat-pulldown', 'Lat pulldown', 'pull-v', 'compound', ['back', 'biceps'], GYM, 'A lat pulldown machine', [], 1, 'reps', {
    steps: ['Set the thigh pad so your legs are locked in.', 'Grip the bar a bit wider than your shoulders.', 'Pull the bar to your upper chest, leaning back slightly.', 'Let it rise until your arms are straight.'],
    cues: ['Pull your elbows down to your pockets.', 'Chest up to meet the bar.'],
    mistakes: ['Pulling behind your neck.', 'Swinging your body.'],
    tips: ['Think “elbows down” rather than “hands down”.'],
  }, { harder: 'assisted-pull-up' }),
  ex('assisted-pull-up', 'Assisted pull-up', 'pull-v', 'compound', ['back', 'biceps'], GYM, 'An assisted pull-up machine or a band', ['shoulders'], 2, 'reps', {
    steps: ['Set the assistance, kneel or stand on the pad and grip the bar just wider than your shoulders.', 'Start from straight arms.', 'Pull until your chin clears the bar.', 'Lower all the way down.'],
    cues: ['Shoulders down first, then pull.', 'Full hang every rep.'],
    mistakes: ['Half reps.', 'Kicking your legs.'],
    tips: ['Take a little assistance off every couple of weeks.'],
  }, { easier: 'lat-pulldown', harder: 'pull-up' }),
  ex('pull-up', 'Pull-up', 'pull-v', 'compound', ['back', 'biceps'], GYM, 'A pull-up bar', ['shoulders'], 3, 'reps', {
    steps: ['Hang from the bar, hands just wider than your shoulders, palms away.', 'Pull your shoulders down, then pull your chest toward the bar.', 'Clear the bar with your chin.', 'Lower to a full hang.'],
    cues: ['Legs still, body tight.', 'Lead with your chest.'],
    mistakes: ['Kipping or swinging.', 'Stopping short of a full hang.'],
    tips: ['Can’t do one yet? Jump up and lower yourself slowly, over 3 to 5 seconds.'],
  }, { easier: 'assisted-pull-up' }),

  /* ── Shoulders ── */
  ex('lateral-raise', 'Lateral raise', 'raise', 'accessory', ['shoulders'], HOME, 'Light dumbbells', ['shoulders'], 1, 'reps', {
    steps: ['Stand tall with light dumbbells at your sides.', 'With a soft bend in your elbows, raise your arms out to the sides.', 'Stop at shoulder height.', 'Lower slowly.'],
    cues: ['Lead with your elbows.', 'Think “wide”, not “high”.'],
    mistakes: ['Swinging the weights up.', 'Shrugging.'],
    tips: ['Lighter than you think, slower than you think.'],
  }),
  ex('reverse-snow-angel', 'Reverse snow angel', 'rear', 'accessory', ['back', 'shoulders'], BW, 'No kit', [], 1, 'reps', {
    steps: ['Lie face down, arms by your sides, palms down, forehead on a towel.', 'Lift your arms just off the floor.', 'Sweep them in a wide arc until your hands meet overhead.', 'Sweep back to your sides.'],
    cues: ['Arms stay off the floor.', 'Slow and smooth.'],
    mistakes: ['Lifting your head.', 'Rushing the arc.'],
    tips: ['Slow is the point here.'],
  }),
  ex('band-pull-apart', 'Band pull-apart', 'rear', 'accessory', ['shoulders', 'back'], HOME, 'A resistance band', [], 1, 'reps', {
    steps: ['Hold a band in front of you at shoulder height, hands shoulder-width apart.', 'Pull the band apart, arms straight, until it touches your chest.', 'Squeeze your shoulder blades.', 'Return slowly.'],
    cues: ['Shoulders down, away from your ears.', 'Straight arms.'],
    mistakes: ['Bending your elbows.', 'Arching your back.'],
    tips: ['Also a good warm-up before pressing.'],
  }),
  ex('reverse-fly', 'Reverse fly', 'rear', 'accessory', ['shoulders', 'back'], HOME, 'Light dumbbells', [], 1, 'reps', {
    steps: ['Hinge forward with a flat back, light dumbbells hanging.', 'With soft elbows, raise your arms out to the sides.', 'Squeeze your shoulder blades at the top.', 'Lower slowly.'],
    cues: ['Arms wide, like wings.', 'Keep your neck long.'],
    mistakes: ['Rowing instead of flying.', 'Using momentum.'],
    tips: ['Rest your forehead on an incline bench to keep still.'],
  }),
  ex('face-pull', 'Face pull', 'rear', 'accessory', ['shoulders', 'back'], GYM, 'A cable with a rope', [], 1, 'reps', {
    steps: ['Set a rope on a cable at about face height.', 'Hold the rope ends, thumbs toward you, and step back.', 'Pull the rope toward your face, hands finishing beside your ears.', 'Return slowly.'],
    cues: ['Elbows high.', 'Squeeze between your shoulder blades.'],
    mistakes: ['Leaning back.', 'Pulling to your chest.'],
    tips: ['Light and controlled: this one is about feel, not weight.'],
  }),

  /* ── Arms ── */
  ex('db-curl', 'Dumbbell curl', 'biceps', 'accessory', ['biceps', 'forearms'], HOME, 'Dumbbells', [], 1, 'reps', {
    steps: ['Stand tall with dumbbells at your sides, palms forward.', 'Curl the weights up, keeping your elbows by your sides.', 'Squeeze at the top.', 'Lower slowly to straight arms.'],
    cues: ['Elbows still.', 'Take two or three seconds on the way down.'],
    mistakes: ['Swinging.', 'Half reps.'],
    tips: ['Alternate arms to focus on each one.'],
  }),
  ex('hammer-curl', 'Hammer curl', 'biceps', 'accessory', ['biceps', 'forearms'], HOME, 'Dumbbells', [], 1, 'reps', {
    steps: ['Hold dumbbells at your sides, palms facing in.', 'Curl up, keeping your palms facing in.', 'Pause at the top.', 'Lower slowly.'],
    cues: ['Thumbs up the whole time.', 'Elbows pinned.'],
    mistakes: ['Swinging.', 'Shoulders rolling forward.'],
    tips: ['Works your grip as well.'],
  }),
  ex('ez-bar-curl', 'EZ bar curl', 'biceps', 'accessory', ['biceps', 'forearms'], GYM, 'An EZ bar', [], 1, 'reps', {
    steps: ['Hold an EZ bar with an underhand grip, arms long.', 'Curl it up, elbows by your sides.', 'Squeeze at the top.', 'Lower slowly.'],
    cues: ['Elbows still.', 'Stand tall.'],
    mistakes: ['Leaning back.', 'Dropping the bar fast.'],
    tips: ['Many people find the angled grip more comfortable than a straight bar.'],
  }),
  ex('bench-dip', 'Bench dip', 'triceps', 'accessory', ['triceps', 'chest'], BW, 'A bench or sturdy chair', ['shoulders', 'wrists'], 1, 'reps', {
    steps: ['Sit on the edge of a bench, hands beside your hips, fingers forward.', 'Slide off so your weight is on your hands, knees bent.', 'Bend your elbows to lower until they’re at about 90 degrees.', 'Press back up.'],
    cues: ['Stay close to the bench.', 'Elbows point back.'],
    mistakes: ['Dropping too low.', 'Shoulders rolling forward.'],
    tips: ['Straighten your legs to make it harder.'],
  }),
  ex('close-grip-push-up', 'Close-grip push-up', 'triceps', 'accessory', ['triceps', 'chest'], BW, 'No kit', ['wrists'], 2, 'reps', {
    steps: ['Get into a push-up position with your hands under your shoulders.', 'Lower, keeping your elbows close to your sides.', 'Press back up.', 'Keep your body straight throughout.'],
    cues: ['Elbows brush your ribs.', 'Tight plank.'],
    mistakes: ['Hands too close together.', 'Hips sagging.'],
    tips: ['Hands on a bench makes it easier.'],
  }),
  ex('overhead-triceps-extension', 'Overhead triceps extension', 'triceps', 'accessory', ['triceps'], HOME, 'A dumbbell', ['shoulders'], 1, 'reps', {
    steps: ['Hold one dumbbell overhead with both hands.', 'Lower it behind your head by bending your elbows.', 'Stop at a good stretch.', 'Straighten your arms to press it back up.'],
    cues: ['Elbows point forward, not out.', 'Ribs down.'],
    mistakes: ['Arching your back.', 'Elbows flaring wide.'],
    tips: ['Sitting with back support keeps you still.'],
  }),
  ex('triceps-pushdown', 'Triceps pushdown', 'triceps', 'accessory', ['triceps'], GYM, 'A cable with a bar or rope', [], 1, 'reps', {
    steps: ['Face a high cable, holding the bar or rope.', 'Elbows by your sides, forearms up.', 'Push down until your arms are straight.', 'Return slowly to just above 90 degrees.'],
    cues: ['Elbows pinned.', 'Squeeze at the bottom.'],
    mistakes: ['Elbows drifting forward.', 'Leaning over the weight.'],
    tips: ['With a rope, spread the ends apart at the bottom.'],
  }),

  /* ── Core ── */
  ex('dead-bug', 'Dead bug', 'core', 'core', ['core'], BW, 'No kit', [], 1, 'reps', {
    steps: ['Lie on your back, arms up, knees bent at 90 degrees over your hips.', 'Press your lower back gently into the floor.', 'Slowly lower one arm and the opposite leg toward the floor.', 'Return and switch sides.'],
    cues: ['Lower back stays down.', 'Breathe out as you reach.'],
    mistakes: ['Back arching off the floor.', 'Moving fast.'],
    tips: ['Smaller reaches first; go longer as your control improves.'],
  }),
  ex('bird-dog', 'Bird dog', 'core', 'core', ['core', 'back', 'glutes'], BW, 'No kit', [], 1, 'reps', {
    steps: ['Start on hands and knees, hands under your shoulders, knees under your hips.', 'Reach one arm forward and the opposite leg back.', 'Hold for a breath with your hips level.', 'Return and switch sides.'],
    cues: ['Imagine a glass of water on your back.', 'Reach long, not high.'],
    mistakes: ['Hips rotating.', 'Arching your back.'],
    tips: ['Slower is harder, and better.'],
  }),
  ex('plank', 'Plank', 'core', 'core', ['core'], BW, 'No kit', [], 1, 'seconds', {
    steps: ['Forearms on the floor, elbows under your shoulders.', 'Step your feet back, body straight from head to heels.', 'Brace your stomach and squeeze your glutes.', 'Hold, breathing steadily.'],
    cues: ['Push the floor away with your forearms.', 'Long neck, eyes down.'],
    mistakes: ['Hips sagging or piking.', 'Holding your breath.'],
    tips: ['Knees down makes it easier.', 'Stop when the shape goes: quality over time.'],
  }),
  ex('side-plank', 'Side plank', 'core', 'core', ['core'], BW, 'No kit', ['shoulders'], 1, 'seconds', {
    steps: ['Lie on your side, elbow under your shoulder, legs stacked.', 'Lift your hips so your body makes a straight line.', 'Hold.', 'Switch sides.'],
    cues: ['Hips high and forward.', 'Stack your shoulders.'],
    mistakes: ['Hips sinking.', 'Rolling forward.'],
    tips: ['Bottom knee down makes it easier.'],
  }),
  ex('superman', 'Superman', 'core', 'core', ['back', 'glutes'], BW, 'No kit', ['lower-back'], 1, 'reps', {
    steps: ['Lie face down, arms overhead.', 'Lift your arms, chest and legs a little off the floor.', 'Hold for a breath.', 'Lower.'],
    cues: ['Look at the floor.', 'Long, not high.'],
    mistakes: ['Cranking your neck up.', 'Lifting too high.'],
    tips: ['Lift one arm and the opposite leg to make it easier.'],
  }),
  ex('hollow-hold', 'Hollow hold', 'core', 'core', ['core'], BW, 'No kit', ['lower-back'], 2, 'seconds', {
    steps: ['Lie on your back and press your lower back into the floor.', 'Lift your shoulders and legs off the floor, arms by your ears.', 'Hold, keeping your lower back down.', 'Lower to rest.'],
    cues: ['Lower back glued down.', 'Point your toes.'],
    mistakes: ['Your back lifting off.', 'Holding your breath.'],
    tips: ['Bend your knees or bring your arms down to make it easier.'],
  }),
  ex('pallof-press', 'Pallof press', 'core', 'core', ['core'], HOME, 'A resistance band or cable', [], 1, 'reps', {
    steps: ['Anchor a band at chest height and stand side-on to it.', 'Hold the band at your chest with both hands.', 'Press your hands straight out, resisting the pull.', 'Bring them back; finish the side, then switch.'],
    cues: ['Don’t let it turn you.', 'Hips and shoulders square.'],
    mistakes: ['Twisting toward the anchor.', 'Standing too close.'],
    tips: ['Step further away to make it harder.'],
  }),
  ex('farmer-carry', 'Farmer’s carry', 'core', 'core', ['forearms', 'core', 'back'], HOME, 'Heavy dumbbells or kettlebells', [], 1, 'seconds', {
    steps: ['Pick up a heavy weight in each hand.', 'Stand tall, shoulders back and down.', 'Walk with short, steady steps.', 'Put the weights down with a flat back.'],
    cues: ['Tall and proud.', 'Grip hard.'],
    mistakes: ['Leaning to one side.', 'Rushing.'],
    tips: ['One hand only (a suitcase carry) works your sides harder.'],
  }),
  ex('hanging-knee-raise', 'Hanging knee raise', 'core', 'core', ['core'], GYM, 'A pull-up bar or captain’s chair', ['shoulders'], 2, 'reps', {
    steps: ['Hang from a bar, or support yourself in a captain’s chair.', 'Curl your knees up toward your chest.', 'Pause.', 'Lower slowly without swinging.'],
    cues: ['Curl your hips up, not just your knees.', 'No swinging.'],
    mistakes: ['Using momentum.', 'Dropping fast.'],
    tips: ['The chair version is steadier while you learn.'],
  }),

  /* ── Conditioning ── */
  ex('step-jack', 'Step jacks', 'conditioning', 'conditioning', ['full-body'], BW, 'No kit', [], 1, 'seconds', {
    steps: ['Stand tall, arms by your sides.', 'Step one foot out as your arms rise overhead.', 'Step back in as your arms come down.', 'Alternate sides at a brisk pace.'],
    cues: ['Stay on your toes.', 'Big arm swings.'],
    mistakes: ['Slouching.', 'Slowing to a stroll.'],
    tips: ['A no-jump way to get moving.'],
  }, { harder: 'jumping-jack' }),
  ex('jumping-jack', 'Jumping jacks', 'conditioning', 'conditioning', ['full-body'], BW, 'No kit', ['knees', 'ankles'], 1, 'seconds', {
    steps: ['Stand tall, feet together, arms by your sides.', 'Jump your feet wide as your arms sweep overhead.', 'Jump back to the start.', 'Keep a steady rhythm.'],
    cues: ['Land softly on the balls of your feet.', 'Stay light.'],
    mistakes: ['Landing flat-footed.', 'Going too hard too early.'],
    tips: ['Step one foot out at a time for a no-jump version.'],
  }, { easier: 'step-jack' }),
  ex('mountain-climber', 'Mountain climbers', 'conditioning', 'conditioning', ['core', 'full-body'], BW, 'No kit', ['wrists'], 1, 'seconds', {
    steps: ['Start in a high plank, hands under your shoulders.', 'Drive one knee toward your chest.', 'Switch legs, as if running on the spot.', 'Keep your hips level.'],
    cues: ['Shoulders over hands.', 'Quick feet, quiet hips.'],
    mistakes: ['Hips bouncing high.', 'Hands drifting forward.'],
    tips: ['Slow it to a march to make it easier.'],
  }),
  ex('high-knees', 'High knees', 'conditioning', 'conditioning', ['full-body'], BW, 'No kit', ['knees', 'ankles'], 1, 'seconds', {
    steps: ['Stand tall.', 'Run on the spot, driving your knees up to hip height.', 'Pump your arms.', 'Stay on the balls of your feet.'],
    cues: ['Tall posture.', 'Quick and light.'],
    mistakes: ['Leaning back.', 'Knees only halfway up.'],
    tips: ['March with high knees for a no-jump version.'],
  }),
  ex('shadow-boxing', 'Shadow boxing', 'conditioning', 'conditioning', ['full-body', 'shoulders'], BW, 'No kit', [], 1, 'seconds', {
    steps: ['Stand side-on, feet shoulder-width apart, hands up by your chin.', 'Throw straight punches: jab, then cross.', 'Add hooks and keep your feet moving.', 'Bring your hands back to your chin after every punch.'],
    cues: ['Turn your hips into the cross.', 'Breathe out with each punch.'],
    mistakes: ['Dropping your hands.', 'Locking your elbows.'],
    tips: ['Try rounds: 30 seconds fast, 30 seconds moving lightly.'],
  }),
  ex('burpee', 'Burpee', 'conditioning', 'conditioning', ['full-body'], BW, 'No kit', ['knees', 'wrists'], 2, 'seconds', {
    steps: ['Squat down and place your hands on the floor.', 'Jump or step your feet back into a plank.', 'Jump or step your feet back in.', 'Stand up and jump, reaching overhead.'],
    cues: ['Smooth, not frantic.', 'Land softly.'],
    mistakes: ['Belly-flopping to the floor.', 'Hips sagging in the plank.'],
    tips: ['Step instead of jumping for a lower-impact version.'],
  }),
  ex('skater-hop', 'Skater hops', 'conditioning', 'conditioning', ['glutes', 'quads'], BW, 'No kit', ['knees', 'ankles'], 2, 'seconds', {
    steps: ['Stand on one leg with a slight bend in the knee.', 'Jump sideways to land on the other foot.', 'Let the trailing leg sweep behind.', 'Jump back and keep going.'],
    cues: ['Land softly and hold for a beat.', 'Stay low.'],
    mistakes: ['Landing with a straight leg.', 'Jumping too far too soon.'],
    tips: ['Step instead of hopping to make it easier.'],
  }),
  ex('db-thruster', 'Dumbbell thruster', 'conditioning', 'conditioning', ['full-body', 'quads', 'shoulders'], HOME, 'Dumbbells', ['knees', 'shoulders'], 2, 'seconds', {
    steps: ['Hold dumbbells at your shoulders, feet shoulder-width apart.', 'Squat down.', 'Drive up and use the momentum to press the dumbbells overhead.', 'Lower them to your shoulders as you go into the next squat.'],
    cues: ['One smooth movement.', 'Ribs down at the top.'],
    mistakes: ['Pressing before you’ve stood up.', 'Rounding at the bottom.'],
    tips: ['Use lighter weights than you would squat or press on their own.'],
  }),
  ex('bike-sprint', 'Bike sprints', 'conditioning', 'conditioning', ['quads', 'full-body'], GYM, 'An exercise bike', [], 1, 'seconds', {
    steps: ['Set the seat so your knee is slightly bent at the bottom of the pedal stroke.', 'Pedal easily to warm up.', 'Sprint hard for the set time.', 'Pedal easily to recover.'],
    cues: ['Sit tall, shoulders relaxed.', 'Add resistance rather than spinning out.'],
    mistakes: ['A seat set too low.', 'Bouncing in the saddle.'],
    tips: ['No jumping involved, so a good pick when jumping is out.'],
  }),
  ex('rower-intervals', 'Rowing machine', 'conditioning', 'conditioning', ['full-body', 'back'], GYM, 'A rowing machine', ['lower-back'], 1, 'seconds', {
    steps: ['Strap your feet in and sit tall, knees bent, arms long.', 'Drive with your legs first.', 'Then lean back slightly and pull the handle to your lower ribs.', 'Return arms, body, then legs, and repeat.'],
    cues: ['Legs, body, arms; then arms, body, legs.', 'Most of the power comes from your legs.'],
    mistakes: ['Pulling with your arms first.', 'Hunching over.'],
    tips: ['A damper setting of about 3 to 5 is plenty.'],
  }),

  /* ── Mobility ── */
  ex('cat-cow', 'Cat-cow', 'mobility', 'mobility', ['back', 'core'], BW, 'No kit', [], 1, 'reps', {
    steps: ['Start on hands and knees.', 'Breathe in as you drop your belly and lift your chest.', 'Breathe out as you round your back toward the ceiling.', 'Move slowly between the two.'],
    cues: ['Move one part of your back at a time.', 'Breathe with the movement.'],
    mistakes: ['Rushing.', 'Only moving your neck.'],
    tips: ['A gentle way to start any session.'],
  }),
  ex('worlds-greatest-stretch', 'World’s greatest stretch', 'mobility', 'mobility', ['hips', 'back', 'hamstrings'], BW, 'No kit', [], 1, 'reps', {
    steps: ['Step into a long lunge, back knee down if you like.', 'Put both hands inside your front foot.', 'Rotate, reaching your inside arm to the ceiling.', 'Bring it back down, then switch sides.'],
    cues: ['Follow your hand with your eyes.', 'Take a long breath at the top.'],
    mistakes: ['Rushing through it.', 'Front knee caving in.'],
    tips: ['Several warm-up moves in one.'],
  }),
  ex('leg-swings', 'Leg swings', 'mobility', 'mobility', ['hips'], BW, 'A wall to hold', [], 1, 'reps', {
    steps: ['Stand side-on to a wall with one hand on it.', 'Swing your outside leg forward and back.', 'Let the swing grow gradually.', 'Switch sides.'],
    cues: ['Tall and relaxed.', 'Controlled swings.'],
    mistakes: ['Leaning.', 'Kicking hard.'],
    tips: ['Add side-to-side swings in front of you too.'],
  }),
  ex('arm-circles', 'Arm circles', 'mobility', 'mobility', ['shoulders'], BW, 'No kit', [], 1, 'reps', {
    steps: ['Stand tall, arms out to the sides.', 'Make small circles forward.', 'Let them grow bigger.', 'Reverse the direction.'],
    cues: ['Relaxed shoulders.', 'Smooth circles.'],
    mistakes: ['Shrugging.', 'Rushing.'],
    tips: ['A good start before any pressing.'],
  }),
  ex('open-book', 'Open book', 'mobility', 'mobility', ['back', 'chest'], BW, 'No kit', [], 1, 'reps', {
    steps: ['Lie on your side, knees bent to 90 degrees, arms straight in front.', 'Sweep your top arm up and over, opening your chest.', 'Let your eyes follow your hand.', 'Return; finish the reps, then switch sides.'],
    cues: ['Knees stay together.', 'Breathe out as you open.'],
    mistakes: ['Knees lifting.', 'Forcing the range.'],
    tips: ['Pin your knees down with your bottom hand.'],
  }),
  ex('thread-the-needle', 'Thread the needle', 'mobility', 'mobility', ['back', 'shoulders'], BW, 'No kit', [], 1, 'reps', {
    steps: ['Start on hands and knees.', 'Slide one arm under your body along the floor, turning your chest.', 'Rest your shoulder and ear down.', 'Come back and open the arm to the ceiling; switch sides after the reps.'],
    cues: ['Hips stay over your knees.', 'Follow your hand with your eyes.'],
    mistakes: ['Hips shifting sideways.', 'Rushing.'],
    tips: ['Pause at each end.'],
  }),
  ex('hip-flexor-stretch', 'Kneeling hip flexor stretch', 'mobility', 'mobility', ['hips'], BW, 'A cushion', [], 1, 'seconds', {
    steps: ['Kneel on one knee, the other foot flat in front.', 'Tuck your hips under and squeeze the glute of the back leg.', 'Shift forward a little until you feel a stretch at the front of the hip.', 'Hold, then switch sides.'],
    cues: ['Tuck, then shift.', 'Tall through your spine.'],
    mistakes: ['Arching your lower back.', 'Leaning too far forward.'],
    tips: ['Put a cushion under the knee.'],
  }),
  ex('hamstring-stretch', 'Lying hamstring stretch', 'mobility', 'mobility', ['hamstrings'], BW, 'A towel or strap', [], 1, 'seconds', {
    steps: ['Lie on your back with a towel looped around one foot.', 'Straighten that leg toward the ceiling.', 'Gently pull until you feel a stretch.', 'Hold, then switch.'],
    cues: ['Keep the other leg long on the floor.', 'Relax your shoulders.'],
    mistakes: ['Bending the raised knee a lot.', 'Pulling hard.'],
    tips: ['Breathe out to ease a little further.'],
  }),
  ex('calf-stretch', 'Wall calf stretch', 'mobility', 'mobility', ['calves'], BW, 'A wall', [], 1, 'seconds', {
    steps: ['Face a wall with your hands on it.', 'Step one foot back, heel down, leg straight.', 'Lean in until you feel a stretch in the calf.', 'Hold, then switch sides.'],
    cues: ['Back heel stays down.', 'Toes point forward.'],
    mistakes: ['Turning the back foot out.', 'Bouncing.'],
    tips: ['Bend the back knee a little to feel it lower down.'],
  }),
  ex('doorway-chest-stretch', 'Doorway chest stretch', 'mobility', 'mobility', ['chest', 'shoulders'], BW, 'A doorway', ['shoulders'], 1, 'seconds', {
    steps: ['Stand in a doorway, forearms on the frame, elbows at shoulder height.', 'Step one foot through.', 'Lean forward until you feel a stretch across your chest.', 'Hold.'],
    cues: ['Ribs down.', 'A gentle lean.'],
    mistakes: ['Pushing too far.', 'Shrugging.'],
    tips: ['Move your elbows higher or lower to feel it in different places.'],
  }),
  ex('childs-pose', 'Child’s pose', 'mobility', 'mobility', ['back', 'hips'], BW, 'No kit', ['knees'], 1, 'seconds', {
    steps: ['Kneel with your big toes together and knees wide.', 'Sit back toward your heels.', 'Walk your hands forward and rest your forehead down.', 'Breathe slowly into your back.'],
    cues: ['Let your hips sink.', 'Long, slow breaths.'],
    mistakes: ['Holding tension in your shoulders.', 'Forcing your hips down.'],
    tips: ['A cushion between your heels and hips helps.'],
  }),
  ex('ninety-ninety', '90/90 hip switch', 'mobility', 'mobility', ['hips', 'glutes'], BW, 'No kit', ['hips', 'knees'], 2, 'reps', {
    steps: ['Sit with both knees bent at 90 degrees, one leg in front, one to the side.', 'Sit tall.', 'Lift your knees and rotate them to the other side.', 'Keep switching slowly.'],
    cues: ['Tall spine.', 'Slow switches.'],
    mistakes: ['Slumping.', 'Forcing it.'],
    tips: ['Hands behind you make it easier.'],
  }),
  ex('deep-squat-hold', 'Deep squat hold', 'mobility', 'mobility', ['hips', 'quads', 'calves'], BW, 'Something to hold (optional)', ['knees', 'ankles', 'hips'], 2, 'seconds', {
    steps: ['Stand with feet a bit wider than your shoulders, toes out.', 'Sink into the deepest squat you can with your heels down.', 'Push your knees out with your elbows.', 'Hold, breathing slowly.'],
    cues: ['Chest up.', 'Heels heavy.'],
    mistakes: ['Heels lifting.', 'Rounding hard.'],
    tips: ['Hold a doorframe or post for support.'],
  }),
]

/** One activity of each kind: how to pace it. */
export const ACTIVITIES: Record<ActivityKind, Activity> = {
  walk: {
    id: 'walk', name: 'Brisk walk', kind: 'solo', loads: [], intensity: 'easy', minutes: 30,
    steps: ['Start at an easy pace for the first five minutes.', 'Settle into a brisk pace where you can talk but not sing.', 'Swing your arms and walk tall.', 'Ease off for the last few minutes.'],
    tips: ['Hills or stairs add effort without running.', 'A podcast or a friend makes the time go.'],
  },
  jog: {
    id: 'jog', name: 'Easy jog', kind: 'solo', loads: ['knees', 'ankles'], intensity: 'easy', minutes: 25,
    steps: ['Walk for five minutes to warm up.', 'Jog at a pace where you could hold a conversation.', 'Walk for a minute whenever you need to: that’s part of the plan.', 'Walk for the last few minutes.'],
    tips: ['Slower than you think: easy should feel easy.', 'Run-walk is a real method, not a cheat.'],
  },
  run: {
    id: 'run', name: 'Run', kind: 'solo', loads: ['knees', 'ankles'], intensity: 'steady', minutes: 30,
    steps: ['Warm up with five to ten minutes of easy running.', 'Run the middle at a steady pace, where you can speak in short sentences.', 'Or try intervals: 1 to 3 minutes harder, the same easy, five or six times.', 'Finish with five minutes easy.'],
    tips: ['Keep most of your weekly running easy.', 'Add only a little time each week.'],
  },
  ride: {
    id: 'ride', name: 'Bike ride', kind: 'solo', loads: [], intensity: 'steady', minutes: 45,
    steps: ['Spin easily for the first ten minutes.', 'Ride the middle at a steady effort, where you can talk in short bursts.', 'Keep a smooth, quick pedal stroke.', 'Ease off for the last five minutes.'],
    tips: ['Check your saddle height: a slight bend in the knee at the bottom.', 'An exercise bike counts.'],
  },
  swim: {
    id: 'swim', name: 'Swim', kind: 'solo', loads: ['shoulders'], intensity: 'steady', minutes: 30,
    steps: ['Warm up with a few easy lengths, mixing strokes.', 'Swim the main set in blocks, for example four lots of 100 metres with a short rest.', 'Keep your stroke long and relaxed.', 'Finish with a couple of easy lengths.'],
    tips: ['Breathe out steadily under the water.', 'Kick from the hips, not the knees.'],
  },
  spin: {
    id: 'spin', name: 'Spin class', kind: 'class', loads: [], intensity: 'hard', minutes: 45,
    steps: ['Arrive a few minutes early to set up your bike.', 'Follow the instructor, but you control the resistance.', 'Hard efforts should feel hard; recoveries should feel easy.', 'Stretch your legs afterwards.'],
    tips: ['Tell the instructor if it’s your first class.', 'Bring water and a towel.'],
  },
  hiit: {
    id: 'hiit', name: 'HIIT or circuits class', kind: 'class', loads: ['knees', 'ankles'], intensity: 'hard', minutes: 45,
    steps: ['Warm up properly with the group.', 'Work hard in the work intervals and go easy in the rests.', 'Take the lower-impact option whenever you need it.', 'Cool down and stretch.'],
    tips: ['Form first, speed second.', 'Keep it away from your hardest leg day.'],
  },
  yoga: {
    id: 'yoga', name: 'Yoga', kind: 'class', loads: [], intensity: 'easy', minutes: 60,
    steps: ['Let the teacher know if you’re new.', 'Move within a range that feels comfortable.', 'Follow your breath.', 'Stay for the relaxation at the end.'],
    tips: ['Blocks and straps are there to be used.', 'There’s no prize for the deepest pose.'],
  },
  pilates: {
    id: 'pilates', name: 'Pilates', kind: 'class', loads: [], intensity: 'easy', minutes: 50,
    steps: ['Let the instructor know if you’re new.', 'Move slowly and with control.', 'Focus on your breathing and your middle.', 'Ask for another option on anything that doesn’t suit you.'],
    tips: ['Mat or reformer both count.', 'Sits well alongside your lifting days.'],
  },
  boxing: {
    id: 'boxing', name: 'Boxing class', kind: 'class', loads: ['shoulders', 'wrists'], intensity: 'hard', minutes: 45,
    steps: ['Wrap your hands if you’re hitting pads or bags.', 'Learn the stance and guard first.', 'Work in rounds: hard during the round, easy in the rest.', 'Cool down and stretch.'],
    tips: ['Technique beats power.', 'Bring your own wraps.'],
  },
  sport: {
    id: 'sport', name: 'Sport', kind: 'sport', loads: ['knees', 'ankles'], intensity: 'hard', minutes: 60,
    steps: ['Warm up before you play, not during.', 'Play.', 'Cool down with an easy jog or walk and a stretch.', 'Drink some water afterwards.'],
    tips: ['Keep heavy leg sessions away from the day before a match.', 'Count a match as a hard session.'],
  },
}

const BY_ID = new Map(EXERCISES.map((e) => [e.id, e]))

export function exerciseById(id: string): Exercise | undefined {
  return BY_ID.get(id)
}

export function isExerciseId(id: unknown): id is string {
  return typeof id === 'string' && BY_ID.has(id)
}
