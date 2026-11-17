// All game text, in English and German.
const en = {
  tagline: 'Build coasters. Run your park.',
  m_continue: 'Continue career', m_new_career: 'New career', m_sandbox: 'Sandbox', m_sandbox_cont: 'Continue sandbox',
  m_sandbox_new: 'New sandbox', m_help: 'How to play', m_career_desc: 'Start small, reach goals, unlock new rides.',
  m_sandbox_desc: 'Everything unlocked, money is no problem.',
  confirm_new: 'This replaces your saved park. Start a new one?', yes: 'Yes', no: 'No', ok: 'OK', close: 'Close',
  lang_name: 'English', s_music: 'Music', s_sfx: 'Sounds', s_lang: 'Language', s_menu: 'Main menu', s_save: 'Save now',
  on: 'On', off: 'Off', saved: 'Park saved', settings: 'Settings',

  t_inspect: 'Look', t_path: 'Paths', t_rides: 'Rides', t_coasters: 'Coasters', t_stalls: 'Stalls', t_scenery: 'Scenery',
  t_terrain: 'Land', t_demolish: 'Remove',

  n_carousel: 'Carousel', n_castle: 'Bouncy Castle', n_teacups: 'Teacups', n_ferris: 'Ferris Wheel', n_swing: 'Wave Swinger',
  n_pirate: 'Pirate Ship', n_bumper: 'Bumper Cars', n_haunted: 'Haunted House', n_drop: 'Drop Tower',
  n_burger: 'Burger Stand', n_drinks: 'Drinks Stand', n_icecream: 'Ice Cream', n_toilet: 'Toilets', n_gift: 'Balloon Shop',
  n_oak: 'Oak', n_pine: 'Pine', n_palm: 'Palm', n_bush: 'Bush', n_flowers: 'Flowers', n_bench: 'Bench', n_lamp: 'Lamp',
  n_fountain: 'Fountain', n_statue: 'Statue', n_rock: 'Rock',
  n_mini: 'Mini Coaster', n_wood: 'Wooden Coaster', n_steel: 'Steel Coaster',
  n_pathtile: 'Path', n_raise: 'Raise land', n_lower: 'Lower land', n_water: 'Add water', n_fill: 'Drain water',
  d_mini: 'Small and cheap. No steep hills.', d_wood: 'Tall hills and lots of airtime.', d_steel: 'Very tall, with loops and banked turns.',
  locked: 'Research',

  open_park: 'Open park', close_park: 'Close park', goals: 'Goals', research: 'Research', finances: 'Money', menu: 'Menu',
  park: 'Park', guests: 'Guests', rating: 'Park rating', pause: 'Pause', speed1: 'Normal speed', speed2: 'Fast', speed4: 'Very fast',
  date: '{0} {1}, Year {2}',
  months: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],

  price: 'Price', free: 'Free', open: 'Open', closed: 'Closed', queue: 'Waiting', customers: 'Customers', income: 'Earned',
  excitement: 'Excitement', intensity: 'Intensity', nausea: 'Nausea', demolish: 'Demolish', edit_track: 'Edit track',
  test_ride: 'Test ride', capacity: 'Seats', length: 'Length', top_speed: 'Top speed', biggest_drop: 'Biggest drop',
  ride_time: 'Ride time', max_g: 'Strongest force', airtime: 'Airtime', guests_pay: 'Guests pay up to about {0}',
  no_access: 'Not next to a path. Guests cannot reach it.', unfinished: 'The track is not finished yet.',
  stuck: 'The train gets stuck! Add a lift hill, a booster, or make the hill lower.',
  r_low: 'low', r_medium: 'medium', r_high: 'high', r_vhigh: 'very high', r_extreme: 'extreme',
  too_intense: 'Too intense for most guests. Slow down before turns or bank them.',
  demolish_q: 'Demolish {0}? You get {1} back.',

  g_happy: 'Happiness', g_hunger: 'Hunger', g_thirst: 'Thirst', g_toilet: 'Toilet', g_nausea: 'Nausea', g_energy: 'Energy',
  g_cash: 'Pocket money', g_thoughts: 'Thoughts', g_rides: 'Rides taken', g_nothoughts: 'Nothing on their mind yet.',
  g_gone: 'This guest has left the park.',
  th_great: '{0} was great!', th_wow: 'Wow, {0} was amazing!', th_sick: '{0} made me feel sick.',
  th_expensive: '{0} is too expensive.', th_wait: 'The queue for {0} is too long.', th_nofood: 'I am hungry and cannot find food.',
  th_nodrink: 'I am thirsty and cannot find a drink.', th_notoilet: 'I need a toilet and cannot find one!',
  th_norides: 'There are not enough rides here for me.', th_home: 'Time to go home.', th_broke: 'I have run out of money.',
  th_unhappy: 'I do not like this park.', th_tired: 'I am tired.', th_rest: 'Nice to sit down for a bit.', th_yum: 'That was tasty.',
  th_gift: 'I love my balloon!',

  f_entry: 'Entry ticket', f_loan: 'Loan', f_borrow: 'Borrow {0}', f_repay: 'Pay back {0}', f_interest: '1% interest per month',
  f_marketing: 'Advertising', f_campaign: 'Start campaign ({0})', f_campaign_on: 'Running: {0} more months',
  f_campaign_desc: 'Brings 40% more guests for 3 months.', f_this: 'This month', f_last: 'Last month',
  c_tickets: 'Entry tickets', c_rides: 'Rides', c_stalls: 'Stalls', c_build: 'Building', c_running: 'Running costs',
  c_research: 'Research', c_interest: 'Loan interest', c_marketing: 'Advertising', c_rewards: 'Goal rewards',
  f_total: 'Total', f_value: 'Park value', f_cash: 'Cash', f_sandbox: 'Money is unlimited in the sandbox.',
  f_fee_hint: 'Guests would pay about {0} right now.',
  turned_away: '{0} guests turned around at the gate: the ticket is too expensive.',

  r_funding: 'Funding per month', r_off: 'Off', r_current: 'Working on', r_next: 'Coming next', r_alldone: 'Everything is researched!',
  r_icecream: 'Ice Cream stall', r_ferris: 'Ferris Wheel', r_nature: 'More trees and rocks', r_wood: 'Wooden Coaster',
  r_swing: 'Wave Swinger', r_deco: 'Lamps and fountains', r_gift: 'Balloon Shop', r_pirate: 'Pirate Ship', r_bumper: 'Bumper Cars',
  r_steel: 'Steel Coaster with loops', r_statue: 'Statues', r_haunted: 'Haunted House', r_booster: 'Coaster boosters', r_drop: 'Drop Tower',
  research_done: 'New: {0}!',

  g_open: 'Open your park with 2 rides and a food stall', g_guests: 'Have {0} guests in the park at once',
  g_coaster: 'Open a coaster with excitement {0} or more', g_ratingx: 'Reach a park rating of {0}',
  g_value: 'Reach a park value of {0}', goal_reward: 'Reward: {0}', goal_done: 'Goal reached!', goal_now: 'Current goal',
  goals_all: 'You reached every goal. You are a real coaster tycoon!', goals_sandbox: 'No goals in the sandbox. Just build!',
  goal_n: 'Goal {0} of {1}',
  p_thoughts: 'What guests are saying', p_none: 'No guests yet. Open the park!', p_peak: 'Most guests at once',
  p_tip_rides: 'More and better rides bring more guests.', ach: 'Achievement: {0}',

  e_bounds: 'That is outside the park.', e_same: '', e_water: 'You cannot build on water.', e_blocked: 'Something is in the way.',
  e_track: 'A coaster track is in the way.', e_money: 'Not enough money.', e_flat: 'This needs flat ground.',
  e_entrance: 'The entrance has to stay.', e_limit: 'The land cannot go further.', e_none: '',
  e_steep: 'This coaster cannot do steep slopes.', e_steepturn: 'Turns can only slope gently.', e_noloop: 'This coaster cannot do loops.',
  e_flatonly: 'This piece must be flat.', e_locked: 'Research this first.', e_low: 'The track cannot go lower.',
  e_high: 'This coaster cannot go higher.', e_ground: 'The ground is in the way.', e_pathclear: 'Too low over the path.',
  e_ends: 'Leave a free tile at both ends of the station.',
  e_closed: 'The track is already complete.', e_station: 'The station has to stay.',
  e_noroute: 'No way back to the station found. Is the station entrance blocked?',

  b_steepdown: 'Steep down', b_down: 'Down', b_flat: 'Flat', b_up: 'Up', b_steepup: 'Steep up', b_left: 'Left', b_straight: 'Straight',
  b_right: 'Right', b_chain: 'Lift', b_bank: 'Banked', b_loop: 'Loop', b_boost: 'Booster', b_brake: 'Brakes', b_undo: 'Undo',
  b_auto: 'Finish for me', b_test: 'Test ride', b_done: 'Done', b_pieces: '{0} pieces', b_endspeed: 'Speed here: {0} km/h',
  b_complete: 'Track complete!', b_station: 'Choose where the station goes.', b_rotate: 'Turn', b_place: 'Build', b_cancel: 'Cancel',
  b_open_q: 'Open it for guests now?', b_height: 'Height {0} m',
  speed_now: 'Speed', test_title: 'Test ride finished', kmh: '{0} km/h', meters: '{0} m', secs: '{0} s', gforce: '{0} G',

  tut_0: 'Welcome to Coastr! Drag to move around the park. Scroll or pinch to zoom.',
  tut_1: 'Choose Paths below and draw a path from the entrance into your park.',
  tut_2: 'Now choose Rides and put one right next to a path.',
  tut_3: 'Guests get hungry. Build a burger stand next to a path under Stalls.',
  tut_4: 'Time to let people in! Press Open park at the top.',
  tut_5: 'Now the best part: choose Coasters, place a station next to a path and build a track back to it. A lift pulls the train up the first hill.',
  tut_6: 'Great! Open the coaster for guests. Check Goals, Research and Money at the top to grow your park. Have fun!',
  tut_skip: 'Skip tips', tut_next: 'Next', tut_touch: 'While building, move the map with two fingers.',

  help_title: 'How to play',
  help: [
    ['Move around', 'Drag the map to move. Scroll or pinch to zoom. While drawing paths, use two fingers (or the right mouse button) to move.'],
    ['Build your park', 'Rides and stalls must stand next to a path, or guests cannot reach them. Guests need food, drinks and toilets.'],
    ['Build a coaster', 'Place the station, then add track pieces with the buttons. Use a lift to pull the train up, then let it roll. The track must come back to the station. Finish for me builds the way back.'],
    ['Ratings', 'Every coaster gets ratings as soon as the track is complete. Speed, drops, airtime and loops make it exciting. Fast flat turns make it too intense. A test ride is optional.'],
    ['Money', 'Set prices by tapping a ride. Tap your cash to change the entry ticket, take a loan or advertise. If guests say something is too expensive, lower the price.'],
    ['Grow', 'Research unlocks new rides. Scenery and happy guests raise your park rating, which brings more guests. In career mode, goals give you rewards.'],
  ],
  sum: {
    th_great: 'Loved a ride', th_wow: 'Amazed by a ride', th_sick: 'Felt sick after a ride', th_expensive: 'Something is too expensive',
    th_wait: 'A queue is too long', th_norides: 'Not enough rides', th_nofood: 'Hungry, no food found', th_nodrink: 'Thirsty, no drinks found',
    th_notoilet: 'Cannot find a toilet', th_home: 'Going home', th_broke: 'Out of money', th_unhappy: 'Does not like the park',
    th_tired: 'Tired', th_rest: 'Enjoyed a rest', th_yum: 'Enjoyed the food', th_gift: 'Loves their balloon',
  },
  a: {
    'first-ride': 'First ride', 'first-coaster': 'Coaster builder', 'guests-50': 'Getting busy', 'guests-150': 'Crowd puller',
    'guests-300': 'Full house', looping: 'Upside down', 'thrill-maker': 'Thrill maker', 'sky-high': 'Sky high',
    'rating-800': 'Five stars', gardener: 'Gardener', lake: 'Lake builder', scientist: 'Scientist', tycoon: 'Tycoon',
    'career-done': 'Career complete',
  },
};

const de = {
  tagline: 'Bau Achterbahnen. Leite deinen Park.',
  m_continue: 'Karriere fortsetzen', m_new_career: 'Neue Karriere', m_sandbox: 'Freies Bauen', m_sandbox_cont: 'Freies Bauen fortsetzen',
  m_sandbox_new: 'Neues freies Bauen', m_help: 'So wird gespielt', m_career_desc: 'Fang klein an, erreiche Ziele, schalte neue Attraktionen frei.',
  m_sandbox_desc: 'Alles freigeschaltet, Geld spielt keine Rolle.',
  confirm_new: 'Dein gespeicherter Park wird ersetzt. Neu anfangen?', yes: 'Ja', no: 'Nein', ok: 'OK', close: 'Zu',
  lang_name: 'Deutsch', s_music: 'Musik', s_sfx: 'Töne', s_lang: 'Sprache', s_menu: 'Hauptmenü', s_save: 'Jetzt speichern',
  on: 'An', off: 'Aus', saved: 'Park gespeichert', settings: 'Einstellungen',

  t_inspect: 'Ansehen', t_path: 'Wege', t_rides: 'Attraktionen', t_coasters: 'Achterbahnen', t_stalls: 'Stände', t_scenery: 'Deko',
  t_terrain: 'Gelände', t_demolish: 'Entfernen',

  n_carousel: 'Karussell', n_castle: 'Hüpfburg', n_teacups: 'Teetassen', n_ferris: 'Riesenrad', n_swing: 'Kettenkarussell',
  n_pirate: 'Piratenschiff', n_bumper: 'Autoscooter', n_haunted: 'Geisterhaus', n_drop: 'Freifallturm',
  n_burger: 'Burgerstand', n_drinks: 'Getränkestand', n_icecream: 'Eisstand', n_toilet: 'Toiletten', n_gift: 'Ballonladen',
  n_oak: 'Eiche', n_pine: 'Tanne', n_palm: 'Palme', n_bush: 'Busch', n_flowers: 'Blumen', n_bench: 'Bank', n_lamp: 'Laterne',
  n_fountain: 'Brunnen', n_statue: 'Statue', n_rock: 'Fels',
  n_mini: 'Mini-Achterbahn', n_wood: 'Holzachterbahn', n_steel: 'Stahlachterbahn',
  n_pathtile: 'Weg', n_raise: 'Land anheben', n_lower: 'Land absenken', n_water: 'Wasser einlassen', n_fill: 'Wasser ablassen',
  d_mini: 'Klein und günstig. Keine steilen Hügel.', d_wood: 'Hohe Hügel und viel Airtime.', d_steel: 'Sehr hoch, mit Loopings und Steilkurven.',
  locked: 'Forschung',

  open_park: 'Park öffnen', close_park: 'Park zumachen', goals: 'Ziele', research: 'Forschung', finances: 'Geld', menu: 'Menü',
  park: 'Park', guests: 'Gäste', rating: 'Parkwertung', pause: 'Pause', speed1: 'Normales Tempo', speed2: 'Schnell', speed4: 'Sehr schnell',
  date: '{0}. {1}, Jahr {2}',
  months: ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'],

  price: 'Preis', free: 'Gratis', open: 'Offen', closed: 'Zu', queue: 'Warten', customers: 'Kunden', income: 'Verdient',
  excitement: 'Spannung', intensity: 'Intensität', nausea: 'Übelkeit', demolish: 'Abbauen', edit_track: 'Strecke ändern',
  test_ride: 'Testfahrt', capacity: 'Plätze', length: 'Länge', top_speed: 'Höchsttempo', biggest_drop: 'Höchste Abfahrt',
  ride_time: 'Fahrzeit', max_g: 'Stärkste Kraft', airtime: 'Airtime', guests_pay: 'Gäste zahlen bis etwa {0}',
  no_access: 'Steht nicht an einem Weg. Gäste kommen nicht hin.', unfinished: 'Die Strecke ist noch nicht fertig.',
  stuck: 'Der Zug bleibt stecken! Bau einen Lift oder Booster ein, oder mach den Hügel niedriger.',
  r_low: 'niedrig', r_medium: 'mittel', r_high: 'hoch', r_vhigh: 'sehr hoch', r_extreme: 'extrem',
  too_intense: 'Zu heftig für die meisten Gäste. Brems vor Kurven ab oder bau Steilkurven.',
  demolish_q: '{0} abbauen? Du bekommst {1} zurück.',

  g_happy: 'Laune', g_hunger: 'Hunger', g_thirst: 'Durst', g_toilet: 'Toilette', g_nausea: 'Übelkeit', g_energy: 'Energie',
  g_cash: 'Taschengeld', g_thoughts: 'Gedanken', g_rides: 'Fahrten', g_nothoughts: 'Noch keine Gedanken.',
  g_gone: 'Dieser Gast hat den Park verlassen.',
  th_great: '{0} war super!', th_wow: 'Wow, {0} war der Wahnsinn!', th_sick: 'Von {0} ist mir schlecht geworden.',
  th_expensive: '{0} ist zu teuer.', th_wait: 'Die Schlange bei {0} ist zu lang.', th_nofood: 'Ich habe Hunger und finde nichts zu essen.',
  th_nodrink: 'Ich habe Durst und finde nichts zu trinken.', th_notoilet: 'Ich muss aufs Klo und finde keins!',
  th_norides: 'Hier gibt es zu wenig Attraktionen für mich.', th_home: 'Zeit, nach Hause zu gehen.', th_broke: 'Mein Geld ist alle.',
  th_unhappy: 'Mir gefällt dieser Park nicht.', th_tired: 'Ich bin müde.', th_rest: 'Schön, kurz zu sitzen.', th_yum: 'Das war lecker.',
  th_gift: 'Ich liebe meinen Ballon!',

  f_entry: 'Eintritt', f_loan: 'Kredit', f_borrow: '{0} leihen', f_repay: '{0} zurückzahlen', f_interest: '1% Zinsen pro Monat',
  f_marketing: 'Werbung', f_campaign: 'Kampagne starten ({0})', f_campaign_on: 'Läuft noch {0} Monate',
  f_campaign_desc: 'Bringt 3 Monate lang 40% mehr Gäste.', f_this: 'Dieser Monat', f_last: 'Letzter Monat',
  c_tickets: 'Eintritt', c_rides: 'Attraktionen', c_stalls: 'Stände', c_build: 'Bauen', c_running: 'Betriebskosten',
  c_research: 'Forschung', c_interest: 'Kreditzinsen', c_marketing: 'Werbung', c_rewards: 'Belohnungen',
  f_total: 'Gesamt', f_value: 'Parkwert', f_cash: 'Geld', f_sandbox: 'Im freien Bauen ist Geld unbegrenzt.',
  f_fee_hint: 'Gäste würden gerade etwa {0} zahlen.',
  turned_away: '{0} Gäste sind am Eingang umgekehrt: der Eintritt ist zu teuer.',

  r_funding: 'Budget pro Monat', r_off: 'Aus', r_current: 'In Arbeit', r_next: 'Danach', r_alldone: 'Alles ist erforscht!',
  r_icecream: 'Eisstand', r_ferris: 'Riesenrad', r_nature: 'Mehr Bäume und Felsen', r_wood: 'Holzachterbahn',
  r_swing: 'Kettenkarussell', r_deco: 'Laternen und Brunnen', r_gift: 'Ballonladen', r_pirate: 'Piratenschiff', r_bumper: 'Autoscooter',
  r_steel: 'Stahlachterbahn mit Loopings', r_statue: 'Statuen', r_haunted: 'Geisterhaus', r_booster: 'Achterbahn-Booster', r_drop: 'Freifallturm',
  research_done: 'Neu: {0}!',

  g_open: 'Öffne deinen Park mit 2 Attraktionen und einem Essensstand', g_guests: 'Hab {0} Gäste gleichzeitig im Park',
  g_coaster: 'Öffne eine Achterbahn mit Spannung {0} oder mehr', g_ratingx: 'Erreiche eine Parkwertung von {0}',
  g_value: 'Erreiche einen Parkwert von {0}', goal_reward: 'Belohnung: {0}', goal_done: 'Ziel erreicht!', goal_now: 'Aktuelles Ziel',
  goals_all: 'Du hast alle Ziele erreicht. Du bist ein echter Achterbahn-Tycoon!', goals_sandbox: 'Im freien Bauen gibt es keine Ziele. Bau einfach los!',
  goal_n: 'Ziel {0} von {1}',
  p_thoughts: 'Was die Gäste sagen', p_none: 'Noch keine Gäste. Öffne den Park!', p_peak: 'Meiste Gäste gleichzeitig',
  p_tip_rides: 'Mehr und bessere Attraktionen bringen mehr Gäste.', ach: 'Erfolg: {0}',

  e_bounds: 'Das liegt nicht mehr im Park.', e_same: '', e_water: 'Auf Wasser kannst du nicht bauen.', e_blocked: 'Da ist etwas im Weg.',
  e_track: 'Da ist eine Achterbahn im Weg.', e_money: 'Nicht genug Geld.', e_flat: 'Das braucht ebenen Boden.',
  e_entrance: 'Der Eingang muss bleiben.', e_limit: 'Weiter geht das Land nicht.', e_none: '',
  e_steep: 'Diese Bahn kann keine steilen Stücke.', e_steepturn: 'Kurven gehen nur mit sanfter Steigung.', e_noloop: 'Diese Bahn kann keine Loopings.',
  e_flatonly: 'Dieses Stück muss eben sein.', e_locked: 'Das musst du erst erforschen.', e_low: 'Tiefer geht die Strecke nicht.',
  e_high: 'Höher kann diese Bahn nicht.', e_ground: 'Der Boden ist im Weg.', e_pathclear: 'Zu niedrig über dem Weg.',
  e_ends: 'Lass an beiden Enden der Station ein Feld frei.',
  e_closed: 'Die Strecke ist schon fertig.', e_station: 'Die Station muss bleiben.',
  e_noroute: 'Kein Weg zurück zur Station gefunden. Ist die Einfahrt der Station blockiert?',

  b_steepdown: 'Steil runter', b_down: 'Runter', b_flat: 'Eben', b_up: 'Hoch', b_steepup: 'Steil hoch', b_left: 'Links', b_straight: 'Gerade',
  b_right: 'Rechts', b_chain: 'Lift', b_bank: 'Steilkurve', b_loop: 'Looping', b_boost: 'Booster', b_brake: 'Bremse', b_undo: 'Zurück',
  b_auto: 'Fertig bauen', b_test: 'Testfahrt', b_done: 'Fertig', b_pieces: '{0} Teile', b_endspeed: 'Tempo hier: {0} km/h',
  b_complete: 'Strecke fertig!', b_station: 'Such einen Platz für die Station.', b_rotate: 'Drehen', b_place: 'Bauen', b_cancel: 'Abbrechen',
  b_open_q: 'Jetzt für Gäste öffnen?', b_height: 'Höhe {0} m',
  speed_now: 'Tempo', test_title: 'Testfahrt beendet', kmh: '{0} km/h', meters: '{0} m', secs: '{0} s', gforce: '{0} G',

  tut_0: 'Willkommen bei Coastr! Zieh, um dich im Park zu bewegen. Scroll oder zieh mit zwei Fingern auseinander, um zu zoomen.',
  tut_1: 'Wähl unten Wege und zeichne einen Weg vom Eingang in deinen Park.',
  tut_2: 'Wähl jetzt Attraktionen und stell eine direkt neben einen Weg.',
  tut_3: 'Gäste bekommen Hunger. Bau unter Stände einen Burgerstand neben einen Weg.',
  tut_4: 'Zeit, die Leute reinzulassen! Drück oben auf Park öffnen.',
  tut_5: 'Jetzt das Beste: Wähl Achterbahnen, stell eine Station neben einen Weg und bau eine Strecke zurück zur Station. Ein Lift zieht den Zug den ersten Hügel hoch.',
  tut_6: 'Super! Öffne die Bahn für Gäste. Unter Ziele, Forschung und Geld oben lässt du deinen Park wachsen. Viel Vergnügen!',
  tut_skip: 'Tipps überspringen', tut_next: 'Weiter', tut_touch: 'Beim Bauen bewegst du die Karte mit zwei Fingern.',

  help_title: 'So wird gespielt',
  help: [
    ['Bewegen', 'Zieh die Karte, um dich zu bewegen. Scroll oder nutze zwei Finger zum Zoomen. Beim Wegezeichnen bewegst du die Karte mit zwei Fingern (oder der rechten Maustaste).'],
    ['Park bauen', 'Attraktionen und Stände müssen neben einem Weg stehen, sonst kommen Gäste nicht hin. Gäste brauchen Essen, Getränke und Toiletten.'],
    ['Achterbahn bauen', 'Stell die Station hin und füg dann mit den Knöpfen Streckenteile an. Ein Lift zieht den Zug hoch, danach rollt er von allein. Die Strecke muss zur Station zurückführen. Fertig bauen baut den Rückweg für dich.'],
    ['Wertungen', 'Jede Bahn bekommt Wertungen, sobald die Strecke fertig ist. Tempo, Abfahrten, Airtime und Loopings machen sie spannend. Schnelle flache Kurven machen sie zu heftig. Eine Testfahrt ist freiwillig.'],
    ['Geld', 'Tipp auf eine Attraktion, um den Preis zu ändern. Tipp auf dein Geld für Eintritt, Kredit und Werbung. Wenn Gäste etwas zu teuer finden, senk den Preis.'],
    ['Wachsen', 'Forschung schaltet neue Attraktionen frei. Deko und zufriedene Gäste heben die Parkwertung, und die bringt mehr Gäste. In der Karriere geben Ziele Belohnungen.'],
  ],
  sum: {
    th_great: 'Fand eine Attraktion super', th_wow: 'War begeistert von einer Attraktion', th_sick: 'Nach einer Fahrt war ihnen schlecht', th_expensive: 'Etwas ist zu teuer',
    th_wait: 'Eine Schlange ist zu lang', th_norides: 'Zu wenig Attraktionen', th_nofood: 'Hunger, nichts zu essen gefunden', th_nodrink: 'Durst, nichts zu trinken gefunden',
    th_notoilet: 'Findet keine Toilette', th_home: 'Geht nach Hause', th_broke: 'Kein Geld mehr', th_unhappy: 'Mag den Park nicht',
    th_tired: 'Müde', th_rest: 'Hat gern kurz gesessen', th_yum: 'Das Essen war lecker', th_gift: 'Liebt den Ballon',
  },
  a: {
    'first-ride': 'Erste Attraktion', 'first-coaster': 'Achterbahnbauer', 'guests-50': 'Es wird voll', 'guests-150': 'Publikumsmagnet',
    'guests-300': 'Volles Haus', looping: 'Kopfüber', 'thrill-maker': 'Nervenkitzel', 'sky-high': 'Himmelhoch',
    'rating-800': 'Fünf Sterne', gardener: 'Gärtner', lake: 'Seebauer', scientist: 'Forscher', tycoon: 'Tycoon',
    'career-done': 'Karriere geschafft',
  },
};

const LANGS = { en, de };
export let lang = 'en';
export function setLang(l) { lang = LANGS[l] ? l : 'en'; document.documentElement.lang = lang; }
export function detectLang() {
  const n = (typeof navigator !== 'undefined' && navigator.language) || 'en';
  return n.toLowerCase().startsWith('de') ? 'de' : 'en';
}
export function t(key, ...args) {
  let s = LANGS[lang][key];
  if (s === undefined) s = en[key];
  if (s === undefined) return key;
  if (typeof s !== 'string') return s;
  return s.replace(/\{(\d)\}/g, (m, i) => (args[i] !== undefined ? args[i] : ''));
}
export function money(n) {
  const neg = n < 0, v = Math.abs(n);
  const str = Number.isInteger(v) ? v.toLocaleString(lang === 'de' ? 'de-DE' : 'en-US') : v.toFixed(2);
  return (neg ? '-' : '') + '$' + str;
}
export function num(n, digits = 0) {
  return n.toLocaleString(lang === 'de' ? 'de-DE' : 'en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}
