'use strict';
const AB_CONFIG = (() => {
  try {
    const params = new URLSearchParams(location.search);
    const requested=params.get('ab')?.toUpperCase();
    return { variant:requested==='A'||requested==='B' ? requested : 'C',
      seed:Math.abs(parseInt(params.get('seed') || '20260728',10)) || 20260728,
      reviewer:(params.get('reviewer')||'').replace(/[^a-z0-9_-]/gi,'').slice(0,32) || null };
  } catch(e) { return { variant:'C', seed:20260728, reviewer:null }; }
})();
const AB_VARIANT = AB_CONFIG.variant, AB_SEED = AB_CONFIG.seed;
const BUILD_ID = 'torus-27';
const AB_CONCEPT = AB_VARIANT === 'A' ? 'big_wing_fixed_wake' : AB_VARIANT === 'B'
  ? 'big_wing_steerable_wake' : 'fusion_rail_blizzard_control';
if (document.body) document.body.dataset.variant = 'C';
if (document.body) document.body.dataset.experiment = AB_VARIANT;
if (document.body) document.body.dataset.concept = AB_CONCEPT;
document.getElementById('start-mode').textContent = AB_VARIANT==='C' ? 'FUSION CONTROL' : 'FUSION TEST ' + AB_VARIANT;
document.getElementById('start-title').textContent = AB_VARIANT === 'A' ? 'WING SWEEP A' : AB_VARIANT === 'B' ? 'WING SWEEP B' : 'THERMAL FUSION';
document.getElementById('start-rules').innerHTML = AB_VARIANT === 'C'
  ? 'destroy the reply <b>IN GRAMMATICAL ORDER</b>; impacts alternate rail slam and core link.<br>' +
    'correct hits grow the escort formation and charge the current movement-blizzard control.<br>' +
    '<b>TYPE TO FOCUS · TAB TO CONFIRM · ← → TO DODGE</b>'
  : 'destroy the reply <b>IN GRAMMATICAL ORDER</b>; impacts alternate rail slam and core link.<br>' +
    'three real hits ready one BIG WING SWEEP. <b>SHIFT+←/→</b> casts it; '+(AB_VARIANT==='B'?'press again to steer its wake.':'its wake direction stays locked.')+'<br>' +
    '<b>TYPE TO FOCUS · TAB TO CONFIRM · ← → TO DODGE</b><br>'+
    '<span style="color:var(--dim)">only the next chunk descends · traps arm the red heat volley · BREAK 1500 resets the field</span>';
document.getElementById('h-variant').textContent = AB_VARIANT;
document.getElementById('h-combat-label').textContent='FUSION';
document.getElementById('h-combo').textContent=AB_VARIANT==='C'?'W0 · S0':'W0 · U0/3';
document.getElementById('h-weapon').textContent='○○○○ · ○○○';
const ITEMS = [
  { id:'decision', ask:"Why hasn't the committee announced its decision?", lead:'They', tail:'.',
    answer:['are waiting','for the chair','to review','the final report'], decoys:['waited'] },
  { id:'library', ask:'Can you tell me when the library closes?', lead:'I think', tail:'.',
    answer:['it stays open','until ten','during','exam week'], decoys:['does it stay open'] },
  { id:'workshop', ask:'Why did Maya miss the workshop?', lead:'She said', tail:'.',
    answer:['that her train','had been delayed','by','the storm'], decoys:['was delaying'] },
  { id:'volunteers', ask:"Are the volunteers ready for tomorrow's event?", lead:'Most of them', tail:'.',
    answer:['have already finished','setting up','the registration area'], decoys:['has already finished'] },
  { id:'research', ask:'Do you know who will lead the new research team?', lead:'', tail:'.',
    answer:['The professor','who joined us','last semester','was selected','to lead it'], decoys:['which joined us'] },
  { id:'introduction', ask:'What did the manager ask you to change?', lead:'She wanted', tail:'.',
    answer:['the introduction','to be shorter','and','more specific'], decoys:['is shorter'] },
  { id:'bus', ask:'Why are you taking the earlier bus?', lead:'I need', tail:'.',
    answer:['to arrive','before','the orientation','begins'], decoys:['will begin'] },
  { id:'laptop', ask:'Did the store replace your laptop?', lead:'They offered', tail:'.',
    answer:['to repair it','instead of','giving me','a new one'], decoys:['repaired it'] },
  { id:'tour', ask:'How was the campus tour?', lead:'', tail:'.',
    answer:['The student','who showed us around','was','extremely','helpful'], decoys:['were'] },
  { id:'class', ask:'Why did the class end early?', lead:'The instructor', tail:'.',
    answer:['had finished','everything','that she','planned to cover'], decoys:['has finished'] },
  { id:'form', ask:'Can I submit the form tomorrow?', lead:'You should ask', tail:'.',
    answer:['whether','the office','will accept','a late submission'], decoys:['does the office accept'] },
  { id:'weekend', ask:'What are you working on this weekend?', lead:'My team', tail:'.',
    answer:['is developing','a plan','to reduce','energy use'], decoys:['develops'] },

  // 58 TOEFL sentence-building items transcribed from the six workbook photos supplied by the user.
  { id:'photo-d01-training', source:'photo-diagnostic-01', ask:'Were there any questions during the training session?', lead:'The new employees wanted', tail:'.',
    answer:['to know','if they','would be able','to access the system'], decoys:['accessing the system'] },
  { id:'photo-d02-exhibit', source:'photo-diagnostic-02', ask:'Which exhibit do you recommend visiting?', lead:'', tail:'.',
    answer:['The one downtown','is great, but','it is hard','to get tickets'], decoys:[] },
  { id:'photo-d03-project-delay', source:'photo-diagnostic-03', ask:"My group still hasn't finished the project.", lead:'', tail:'?',
    answer:['Have you','talked to','your professor','about the delay'], decoys:['talk to your professor'] },
  { id:'photo-d04-former-job', source:'photo-diagnostic-04', ask:'Can I ask why you left your former job?', lead:'I', tail:'.',
    answer:['am looking for','a position','that better fits','my long-term goals'], decoys:['that better fit'] },
  { id:'photo-d05-order', source:'photo-diagnostic-05', ask:'What did the waitress say about our order?', lead:'', tail:'.',
    answer:['She said','the dishes','are being','prepared now'], decoys:['prepare now'] },
  { id:'photo-d06-email-file', source:'photo-diagnostic-06', ask:'Your report last week was very detailed.', lead:'', tail:'?',
    answer:['Would you like','me to email','you','the file'], decoys:[] },
  { id:'photo-d07-bike', source:'photo-diagnostic-07', ask:'Why did you decide to get a new bike?', lead:'', tail:'.',
    answer:['Someone stole mine','while it was','parked in front of','the store'], decoys:['did stole mine'] },
  { id:'photo-d08-assignment', source:'photo-diagnostic-08', ask:"Why haven't Harper and Bill started working on the assignment yet?", lead:'', tail:'.',
    answer:['They just learned','what needs','to be','done'], decoys:['why'] },
  { id:'photo-d09-sales-data', source:'photo-diagnostic-09', ask:'May I ask why you requested the sales data?', lead:'My team', tail:'.',
    answer:['is working','on a plan','to increase revenue','over the next quarter'], decoys:['works on a plan'] },
  { id:'photo-d10-library', source:'photo-diagnostic-10', ask:'Why did you stay late at the library yesterday?', lead:'I', tail:'.',
    answer:['was using','some reference books','that cannot be','checked out'], decoys:[] },

  { id:'photo-58-01-report', source:'photo-p58-01', ask:'Have you finished writing the report?', lead:'', tail:' yet.',
    answer:["I haven't",'had the chance','to do','it'], decoys:[] },
  { id:'photo-58-02-keys', source:'photo-p58-02', ask:"I can't remember where I put my keys.", lead:'', tail:'?',
    answer:['When was','the last time','you had','them'], decoys:['Who had them'] },
  { id:'photo-58-03-assignment-due', source:'photo-p58-03', ask:'I saw you talking to the professor after class yesterday.', lead:'She', tail:'.',
    answer:['wanted to remind me','when the assignment','will be','due'], decoys:['a'] },
  { id:'photo-58-04-final-edit', source:'photo-p58-04', ask:'What did the director mention regarding the final edit?', lead:'', tail:'.',
    answer:['He asked','which scenes','should be','reshot'], decoys:['which scenes were reshot'] },
  { id:'photo-58-05-umbrella', source:'photo-p58-05', ask:'Where did you find your umbrella?', lead:'I', tail:'.',
    answer:['checked every place','I visited','last weekend'], decoys:[] },
  { id:'photo-58-06-budget', source:'photo-p58-06', ask:'Did the committee talk about the budget proposal?', lead:'Yes,', tail:'.',
    answer:['they asked','if further adjustments','were','needed'], decoys:[] },
  { id:'photo-58-07-community', source:'photo-p58-07', ask:'What did your neighbor say about the community meeting?', lead:'', tail:'.',
    answer:['She wondered','who was responsible','for organizing','it'], decoys:['who was responsible to organize'] },
  { id:'photo-58-08-software', source:'photo-p58-08', ask:"I heard there were issues with yesterday's software launch.", lead:'', tail:'.',
    answer:['Customers had trouble','downloading it','from our website'], decoys:['download it'] },

  { id:'photo-64-01-instructions', source:'photo-p64-01', ask:"The professor's instructions on the assignment were a bit unclear.", lead:'I', tail:'.',
    answer:["couldn't figure out",'what she expected','us','to do'], decoys:['how she expected'] },
  { id:'photo-64-02-flights', source:'photo-p64-02', ask:'Have you arranged the flights for our trip?', lead:'No,', tail:'.',
    answer:['I have not','been able','to book','them'], decoys:['I have not be'] },
  { id:'photo-64-03-training', source:'photo-p64-03', ask:'Kelly is not coming to the training session today.', lead:'Can you', tail:'?',
    answer:['tell me','why she',"can't make",'it'], decoys:['why she is making it'] },
  { id:'photo-64-04-orientation', source:'photo-p64-04', ask:'Are you going to the orientation for new students?', lead:'Do you', tail:'?',
    answer:['know','what time','it','starts'], decoys:['where it starts'] },
  { id:'photo-64-05-recipe', source:'photo-p64-05', ask:'Did you try the recipe I sent you?', lead:'', tail:'.',
    answer:['I had trouble finding','some of the ingredients,','but still managed','to make it'], decoys:[] },
  { id:'photo-64-06-manager', source:'photo-p64-06', ask:'What did the manager want to know?', lead:'', tail:'.',
    answer:['He wondered','how the new staff members','were','doing'], decoys:['do'] },
  { id:'photo-64-07-concert', source:'photo-p64-07', ask:"We're planning to go to the band's concert this weekend.", lead:'Can you', tail:'?',
    answer:['tell me','if tickets','are still','available'], decoys:['if tickets is available'] },
  { id:'photo-64-08-festival', source:'photo-p64-08', ask:'Did I see you speaking to Eric earlier?', lead:'He', tail:' on Friday.',
    answer:['asked','if I would like','to go to','the school festival'], decoys:[] },
  { id:'photo-64-09-meeting', source:'photo-p64-09', ask:"Why didn't you join us for the meeting this morning?", lead:'', tail:'.',
    answer:['I was late','for work','due to','a bad headache'], decoys:[] },
  { id:'photo-64-10-doctor', source:'photo-p64-10', ask:"I have a doctor's appointment tomorrow.", lead:'', tail:'?',
    answer:['May I ask','where','it','hurts'], decoys:['where it is hurting'] },

  { id:'photo-66-11-photos', source:'photo-p66-11', ask:"The workshop photos were posted on the company's internal site.", lead:'Really?', tail:'.',
    answer:["I didn't know",'they were','uploaded','already'], decoys:['they was uploaded'] },
  { id:'photo-66-12-catering', source:'photo-p66-12', ask:"Who catered last year's holiday party for the company?", lead:'I think John', tail:'.',
    answer:['might remember','which service','we','hired'], decoys:[] },
  { id:'photo-66-13-garden', source:'photo-p66-13', ask:'Did you have a good time on your trip?', lead:'The botanical garden', tail:'.',
    answer:['that we visited','was','very','relaxing'], decoys:['it was relaxing'] },
  { id:'photo-66-14-language', source:'photo-p66-14', ask:'I signed up for a language class this semester.', lead:'I would', tail:'.',
    answer:['love to know','what language','you are','taking up'], decoys:['love know'] },
  { id:'photo-66-15-shoulder', source:'photo-p66-15', ask:'What did the therapist say about your shoulder pain?', lead:'', tail:'.',
    answer:['She recommended','an exercise that','targets the muscle','causing the pain'], decoys:['an exercise is'] },
  { id:'photo-66-16-camera', source:'photo-p66-16', ask:'Where did you get your camera?', lead:'I', tail:'.',
    answer:['bought it','secondhand','from','an online store'], decoys:[] },
  { id:'photo-66-17-apartment', source:'photo-p66-17', ask:"I'm thinking of moving into a new apartment.", lead:"It's about", tail:'.',
    answer:['time','you got','out of','that neighborhood'], decoys:[] },
  { id:'photo-66-18-idea', source:'photo-p66-18', ask:'What did your boss think of your idea?', lead:'She', tail:'.',
    answer:['wants me','to write','a formal proposal','for management'], decoys:['to writing'] },
  { id:'photo-66-19-major', source:'photo-p66-19', ask:"I'm considering changing my major to something else.", lead:'', tail:'?',
    answer:['Do you know','what','the requirements are','for changing majors'], decoys:['the requirements is'] },
  { id:'photo-66-20-pizza', source:'photo-p66-20', ask:'This pizza you brought home tastes delicious.', lead:'I', tail:'.',
    answer:['got it','from a new place','that just opened','down the street'], decoys:[] },

  { id:'photo-68-01-envelopes', source:'photo-p68-01', ask:'Do you have any spare envelopes I could use?', lead:'', tail:'?',
    answer:['Have you tried','looking in','the supply closet'], decoys:['look in the supply closet'] },
  { id:'photo-68-02-representative', source:'photo-p68-02', ask:'Who was chosen to represent our class at the competition?', lead:'', tail:'.',
    answer:['I have no idea','who ended up','being','selected'], decoys:['not being selected'] },
  { id:'photo-68-03-project', source:'photo-p68-03', ask:'Are you worried about having to lead the new project?', lead:'My only concern', tail:'.',
    answer:['is whether','we have','the time','to complete it'], decoys:['the time completing it'] },
  { id:'photo-68-04-anthony', source:'photo-p68-04', ask:'Can you tell me what Anthony was asking about just now?', lead:'He was', tail:'.',
    answer:['curious about','what I was planning','for','the weekend'], decoys:['did'] },
  { id:'photo-68-05-leave', source:'photo-p68-05', ask:'Did the staff say anything about the new leave policy?', lead:'They', tail:'.',
    answer:['wanted to know','when it','would','take effect'], decoys:[] },
  { id:'photo-68-06-coffee', source:'photo-p68-06', ask:'We need a new coffee machine for the break room.', lead:'Do you', tail:'?',
    answer:['remember','where we bought','the last one'], decoys:['who'] },
  { id:'photo-68-07-books', source:'photo-p68-07', ask:'When will the next shipment of books arrive?', lead:'', tail:'.',
    answer:['They are','scheduled to be','delivered in','a couple of days'], decoys:['delivering in a couple of days'] },
  { id:'photo-68-08-computers', source:'photo-p68-08', ask:"I heard our company's getting us new computers.", lead:'', tail:'?',
    answer:['Do you know','when that is','supposed to','happen'], decoys:['suppose to happen'] },
  { id:'photo-68-09-party', source:'photo-p68-09', ask:'Are the Wilsons coming to the party this weekend?', lead:'', tail:'?',
    answer:["Don't you know","they can't",'make it','this weekend'], decoys:[] },
  { id:'photo-68-10-musical', source:'photo-p68-10', ask:"I'm excited to see Ellie perform in the musical.", lead:'', tail:'?',
    answer:['Did she tell','you',"what role she's playing",'in the show'], decoys:['play'] },

  { id:'photo-70-01-training', source:'photo-p70-01', ask:'Why did the HR department reschedule the training session?', lead:'', tail:'.',
    answer:['The trainer was sick',"and couldn't come",'on','the original date'], decoys:[] },
  { id:'photo-70-02-car', source:'photo-p70-02', ask:'Can you tell me why you bought the car?', lead:'I', tail:'.',
    answer:['needed something','reliable for','my long','daily commute'], decoys:[] },
  { id:'photo-70-03-math', source:'photo-p70-03', ask:'Do you know anyone who can help Sean with his math assignment?', lead:'Have', tail:'?',
    answer:['you asked','the student services office','if they','offer tutoring'], decoys:[] },
  { id:'photo-70-04-makeup', source:'photo-p70-04', ask:"I heard tomorrow's class with Professor Clark has been canceled.", lead:'On', tail:'?',
    answer:['which day','is the makeup class','scheduled'], decoys:[] },
  { id:'photo-70-05-credit-card', source:'photo-p70-05', ask:"I'm thinking about signing up for a new credit card.", lead:'', tail:'?',
    answer:['Which types','of benefits','do you','prioritize'], decoys:[] },
  { id:'photo-70-06-office', source:'photo-p70-06', ask:'Why did you leave the office so suddenly yesterday?', lead:'', tail:'.',
    answer:['Something urgent','came up',"that I couldn't",'ignore'], decoys:['that I ignored'] },
  { id:'photo-70-07-shelter', source:'photo-p70-07', ask:"I'm considering volunteering at the local animal shelter.", lead:'', tail:'?',
    answer:['Have you spoken','to someone','who already','volunteers there'], decoys:[] },
  { id:'photo-70-08-midterm', source:'photo-p70-08', ask:'Did Professor Lee mention anything about the midterm schedule?', lead:'', tail:'.',
    answer:['She told us','it should','be finalized','in the next few days'], decoys:['it is finalized'] },
  { id:'photo-70-09-production', source:'photo-p70-09', ask:'Can you confirm if production is on schedule?', lead:"We've", tail:'.',
    answer:['encountered','some unexpected issues','that might cause','a small delay'], decoys:['that might to cause'] },
  { id:'photo-70-10-seminar', source:'photo-p70-10', ask:'What did the department chair ask you?', lead:'', tail:'.',
    answer:['He wondered','who would be','presenting at','the seminar'], decoys:['how would be'] },

  // Four long-form boss sentences close each three-wave sortie. They use the same
  // deterministic order judgement as every other item; only density and length change.
  { id:'boss-review-vote', source:'boss-original', boss:true, ask:'Why did the committee postpone the vote?', lead:'The chair explained', tail:'.',
    answer:['that several members','had requested','more time','to review','the evidence','before they','could vote','on the proposal'],
    decoys:['before could they vote','have requested'] },
  { id:'boss-secure-files', source:'boss-original', boss:true, ask:'What should new employees know about customer files?', lead:'They should remember', tail:'.',
    answer:['that any files','containing customer data','must be stored','on the secure server','and should never','be copied','to personal devices','without authorization'],
    decoys:['must storing','should never be copied them'] },
  { id:'boss-research-method', source:'boss-original', boss:true, ask:'Why was the research plan revised?', lead:'The team discovered', tail:'.',
    answer:['that the original method','would not produce','enough reliable evidence','to support','the conclusion that','the researchers had hoped','to present','at the conference'],
    decoys:['would not produced'] },
  { id:'boss-service-delay', source:'boss-original', boss:true, ask:'What did the director say about the delayed public service?', lead:'She acknowledged', tail:'.',
    answer:['that the agency','should have informed','residents earlier','about the repairs','causing the interruption','and promised that','updated schedules would be posted','as soon as contractors confirmed them'],
    decoys:['should informed'] },
];
const SENTENCES = ITEMS; // compatibility name for portable harnesses
function makeRng(seed){
  let state = seed >>> 0;
  return () => { state = (state * 1664525 + 1013904223) >>> 0; return state / 4294967296; };
}
function textSeed(text){
  let h = 2166136261;
  for (const c of text){ h ^= c.charCodeAt(0); h = Math.imul(h,16777619); }
  return h >>> 0;
}
const ITEM_ORDER = (() => {
  const list = ITEMS.slice(), rng = makeRng(AB_SEED);
  for (let i=list.length-1;i>0;i--){ const j=Math.floor(rng()*(i+1)); [list[i],list[j]]=[list[j],list[i]]; }
  return list;
})();

