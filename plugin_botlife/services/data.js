// Service "data": the world of BotLife: countries and names, studies, jobs,
// activities, crimes and things to buy. Labels are [English, German].

export const COUNTRIES = {
  us: { flag: '🇺🇸', name: ['United States', 'USA'], m: ['James', 'Michael', 'Ethan', 'Noah', 'Liam', 'Mason', 'Logan', 'Lucas'], f: ['Emma', 'Olivia', 'Ava', 'Sophia', 'Mia', 'Harper', 'Ella', 'Grace'], last: ['Smith', 'Johnson', 'Brown', 'Miller', 'Davis', 'Wilson', 'Taylor', 'Anderson'] },
  gb: { flag: '🇬🇧', name: ['United Kingdom', 'Großbritannien'], m: ['Oliver', 'George', 'Harry', 'Jack', 'Arthur', 'Freddie', 'Alfie', 'Theo'], f: ['Amelia', 'Isla', 'Lily', 'Poppy', 'Freya', 'Evie', 'Florence', 'Rosie'], last: ['Jones', 'Williams', 'Evans', 'Thomas', 'Roberts', 'Walker', 'Wright', 'Hughes'] },
  de: { flag: '🇩🇪', name: ['Germany', 'Deutschland'], m: ['Lukas', 'Leon', 'Finn', 'Jonas', 'Paul', 'Felix', 'Max', 'Elias'], f: ['Mia', 'Emma', 'Hannah', 'Lea', 'Lina', 'Marie', 'Clara', 'Lena'], last: ['Müller', 'Schmidt', 'Schneider', 'Fischer', 'Weber', 'Wagner', 'Becker', 'Hoffmann'] },
  fr: { flag: '🇫🇷', name: ['France', 'Frankreich'], m: ['Gabriel', 'Louis', 'Jules', 'Hugo', 'Arthur', 'Raphaël', 'Léo', 'Adam'], f: ['Jade', 'Louise', 'Alice', 'Chloé', 'Inès', 'Léa', 'Manon', 'Camille'], last: ['Martin', 'Bernard', 'Dubois', 'Durand', 'Lefèvre', 'Moreau', 'Laurent', 'Girard'] },
  es: { flag: '🇪🇸', name: ['Spain', 'Spanien'], m: ['Hugo', 'Mateo', 'Martín', 'Pablo', 'Daniel', 'Álvaro', 'Diego', 'Adrián'], f: ['Lucía', 'Sofía', 'Martina', 'Paula', 'Valeria', 'Julia', 'Carmen', 'Elena'], last: ['García', 'Fernández', 'González', 'Rodríguez', 'López', 'Martínez', 'Sánchez', 'Pérez'] },
  it: { flag: '🇮🇹', name: ['Italy', 'Italien'], m: ['Leonardo', 'Francesco', 'Alessandro', 'Lorenzo', 'Mattia', 'Tommaso', 'Riccardo', 'Marco'], f: ['Sofia', 'Giulia', 'Aurora', 'Alice', 'Ginevra', 'Beatrice', 'Chiara', 'Giorgia'], last: ['Rossi', 'Russo', 'Ferrari', 'Esposito', 'Bianchi', 'Romano', 'Colombo', 'Ricci'] },
  jp: { flag: '🇯🇵', name: ['Japan', 'Japan'], m: ['Haruto', 'Sota', 'Yuto', 'Riku', 'Hinata', 'Ren', 'Kaito', 'Daiki'], f: ['Yui', 'Hina', 'Sakura', 'Aoi', 'Mio', 'Rin', 'Yuna', 'Koharu'], last: ['Sato', 'Suzuki', 'Takahashi', 'Tanaka', 'Watanabe', 'Ito', 'Yamamoto', 'Nakamura'] },
  br: { flag: '🇧🇷', name: ['Brazil', 'Brasilien'], m: ['Miguel', 'Arthur', 'Heitor', 'Davi', 'Bernardo', 'Gabriel', 'Pedro', 'Rafael'], f: ['Helena', 'Alice', 'Laura', 'Valentina', 'Manuela', 'Beatriz', 'Júlia', 'Isabela'], last: ['Silva', 'Santos', 'Oliveira', 'Souza', 'Lima', 'Pereira', 'Costa', 'Ferreira'] },
};

/** University majors. */
export const MAJORS = {
  cs: ['Computer Science', 'Informatik'],
  business: ['Business', 'BWL'],
  engineering: ['Engineering', 'Ingenieurwesen'],
  nursing: ['Nursing', 'Pflege'],
  biology: ['Biology', 'Biologie'],
  psychology: ['Psychology', 'Psychologie'],
  law: ['Political Science', 'Politikwissenschaft'],
  arts: ['Fine Arts', 'Kunst'],
};

/**
 * Further schools after university: years, needed majors (none: any), cost
 * per year, and what the degree is called.
 */
export const GRAD = {
  med: { years: 4, majors: ['biology', 'nursing'], cost: 45_000, name: ['Medical School', 'Medizinstudium'] },
  law: { years: 3, majors: [], cost: 40_000, name: ['Law School', 'Jurastudium'] },
  grad: { years: 2, majors: [], cost: 30_000, name: ["Master's degree", 'Master'] },
};
export const UNI_COST = 20_000;
export const UNI_YEARS = 4;

/**
 * Jobs. edu: none | high (high school) | uni (any or one of majors) | med |
 * law | grad. part: part-time job for students from 14. salary per year at
 * level 1; levels 1-5 multiply it.
 */
export const JOBS = {
  fastfood: { name: ['Fast food worker', 'Fast-Food-Kraft'], salary: 9_000, edu: 'none', part: true, minAge: 14 },
  babysitter: { name: ['Babysitter', 'Babysitter'], salary: 6_000, edu: 'none', part: true, minAge: 14 },
  cashier: { name: ['Cashier', 'Kassierer'], salary: 10_000, edu: 'none', part: true, minAge: 15 },
  lifeguard: { name: ['Lifeguard', 'Rettungsschwimmer'], salary: 8_000, edu: 'none', part: true, minAge: 15, health: 50 },
  janitor: { name: ['Janitor', 'Hausmeister'], salary: 24_000, edu: 'none', minAge: 18 },
  waiter: { name: ['Waiter', 'Kellner'], salary: 26_000, edu: 'none', minAge: 18 },
  retail: { name: ['Retail clerk', 'Verkäufer'], salary: 27_000, edu: 'none', minAge: 18 },
  construction: { name: ['Construction worker', 'Bauarbeiter'], salary: 38_000, edu: 'none', minAge: 18, health: 40 },
  model: { name: ['Model', 'Model'], salary: 60_000, edu: 'none', minAge: 16, maxAge: 35, looks: 80 },
  truck: { name: ['Truck driver', 'Lkw-Fahrer'], salary: 48_000, edu: 'high', minAge: 21 },
  secretary: { name: ['Secretary', 'Sekretär'], salary: 38_000, edu: 'high', minAge: 18 },
  mechanic: { name: ['Mechanic', 'Mechaniker'], salary: 45_000, edu: 'high', minAge: 18 },
  police: { name: ['Police officer', 'Polizist'], salary: 52_000, edu: 'high', minAge: 18, health: 50, clean: true },
  firefighter: { name: ['Firefighter', 'Feuerwehrmann'], salary: 50_000, edu: 'high', minAge: 18, health: 60 },
  teacher: { name: ['Teacher', 'Lehrer'], salary: 48_000, edu: 'uni', minAge: 21 },
  software: { name: ['Software engineer', 'Softwareentwickler'], salary: 95_000, edu: 'uni', majors: ['cs'], smarts: 60, minAge: 21 },
  accountant: { name: ['Accountant', 'Buchhalter'], salary: 68_000, edu: 'uni', majors: ['business'], minAge: 21 },
  marketing: { name: ['Marketing manager', 'Marketingmanager'], salary: 72_000, edu: 'uni', majors: ['business', 'psychology', 'arts'], minAge: 21 },
  engineer: { name: ['Engineer', 'Ingenieur'], salary: 88_000, edu: 'uni', majors: ['engineering'], smarts: 55, minAge: 21 },
  nurse: { name: ['Nurse', 'Krankenpfleger'], salary: 72_000, edu: 'uni', majors: ['nursing'], minAge: 21 },
  designer: { name: ['Graphic designer', 'Grafikdesigner'], salary: 52_000, edu: 'uni', majors: ['arts'], minAge: 21 },
  psychologist: { name: ['Psychologist', 'Psychologe'], salary: 78_000, edu: 'uni', majors: ['psychology'], minAge: 22 },
  labtech: { name: ['Lab technician', 'Laborant'], salary: 58_000, edu: 'uni', majors: ['biology'], minAge: 21 },
  paralegal: { name: ['Paralegal', 'Rechtsassistent'], salary: 55_000, edu: 'uni', majors: ['law'], minAge: 21 },
  doctor: { name: ['Doctor', 'Arzt'], salary: 220_000, edu: 'med', smarts: 70, minAge: 25 },
  lawyer: { name: ['Lawyer', 'Anwalt'], salary: 160_000, edu: 'law', smarts: 65, minAge: 24, clean: true },
  professor: { name: ['Professor', 'Professor'], salary: 115_000, edu: 'grad', smarts: 75, minAge: 26 },
  scientist: { name: ['Scientist', 'Wissenschaftler'], salary: 105_000, edu: 'grad', majors: ['biology', 'cs', 'engineering'], smarts: 70, minAge: 25 },
};
export const LEVEL_PAY = [1, 1.25, 1.55, 1.95, 2.5];
export const RETIRE_AGE = 60;

/** Activities: minimum age, cost and the stat changes (min, max). */
export const ACTIVITIES = {
  gym: { emoji: '🏋️', name: ['Gym', 'Fitnessstudio'], minAge: 12, cost: 0 },
  library: { emoji: '📚', name: ['Library', 'Bibliothek'], minAge: 6, cost: 0 },
  meditate: { emoji: '🧘', name: ['Meditate', 'Meditieren'], minAge: 10, cost: 0 },
  doctor: { emoji: '🩺', name: ['Doctor', 'Arzt'], minAge: 0, cost: 300 },
  love: { emoji: '💘', name: ['Find love', 'Liebe finden'], minAge: 16, cost: 0 },
  friend: { emoji: '🤝', name: ['Make a friend', 'Freund finden'], minAge: 5, cost: 0 },
  vacation: { emoji: '🏖️', name: ['Vacation', 'Urlaub'], minAge: 18, cost: 3_000 },
  surgery: { emoji: '💉', name: ['Plastic surgery', 'Schönheits-OP'], minAge: 18, cost: 8_000 },
  casino: { emoji: '🎰', name: ['Casino', 'Casino'], minAge: 18, cost: 0 },
  lottery: { emoji: '🎟️', name: ['Lottery ticket', 'Lottoschein'], minAge: 18, cost: 10 },
  emigrate: { emoji: '✈️', name: ['Emigrate', 'Auswandern'], minAge: 18, cost: 5_000 },
};
/** How often an activity counts per year (more clicks do nothing). */
export const PER_YEAR = 3;

/** Crimes: minimum age, loot (min, max), chance to be caught, prison years (min, max). */
export const CRIMES = {
  shoplift: { emoji: '🛍️', name: ['Shoplift', 'Ladendiebstahl'], minAge: 10, loot: [20, 300], caught: 0.15, years: [0, 1] },
  pickpocket: { emoji: '👛', name: ['Pickpocket', 'Taschendiebstahl'], minAge: 12, loot: [50, 600], caught: 0.2, years: [0, 2] },
  burglary: { emoji: '🏚️', name: ['Burglary', 'Einbruch'], minAge: 14, loot: [1_000, 20_000], caught: 0.3, years: [1, 4] },
  car_theft: { emoji: '🚗', name: ['Steal a car', 'Auto stehlen'], minAge: 16, loot: [5_000, 40_000], caught: 0.35, years: [2, 6] },
  bank_robbery: { emoji: '🏦', name: ['Rob a bank', 'Bank ausrauben'], minAge: 18, loot: [50_000, 2_000_000], caught: 0.6, years: [8, 25] },
};

/** Things to buy: price; houses change value over the years, cars lose it. */
export const ASSETS = {
  studio: { kind: 'house', emoji: '🏢', name: ['Studio flat', 'Einzimmerwohnung'], price: 150_000 },
  apartment: { kind: 'house', emoji: '🏬', name: ['Apartment', 'Wohnung'], price: 280_000 },
  house: { kind: 'house', emoji: '🏡', name: ['Family house', 'Einfamilienhaus'], price: 450_000 },
  villa: { kind: 'house', emoji: '🏘️', name: ['Villa', 'Villa'], price: 1_200_000 },
  mansion: { kind: 'house', emoji: '🏰', name: ['Mansion', 'Herrenhaus'], price: 5_000_000 },
  used_car: { kind: 'car', emoji: '🚙', name: ['Used car', 'Gebrauchtwagen'], price: 6_000 },
  compact: { kind: 'car', emoji: '🚗', name: ['Compact car', 'Kleinwagen'], price: 22_000 },
  sedan: { kind: 'car', emoji: '🚘', name: ['Sedan', 'Limousine'], price: 35_000 },
  suv: { kind: 'car', emoji: '🛻', name: ['SUV', 'SUV'], price: 55_000 },
  sports: { kind: 'car', emoji: '🏎️', name: ['Sports car', 'Sportwagen'], price: 150_000 },
  supercar: { kind: 'car', emoji: '🚀', name: ['Supercar', 'Supersportwagen'], price: 400_000 },
};

/**
 * Illnesses: chance per year (from minAge), health loss per year untreated,
 * heal: chance to pass by itself each year; the doctor cures (hard ones not always).
 */
export const ILLNESSES = {
  flu: { name: ['the flu', 'eine Grippe'], minAge: 0, chance: 0.08, loss: 4, heal: 1 },
  depression: { name: ['depression', 'eine Depression'], minAge: 13, chance: 0.03, loss: 2, happy: 10, heal: 0.3 },
  broken_leg: { name: ['a broken leg', 'ein gebrochenes Bein'], minAge: 5, chance: 0.03, loss: 3, heal: 1 },
  diabetes: { name: ['diabetes', 'Diabetes'], minAge: 30, chance: 0.015, loss: 2 },
  heart: { name: ['a heart disease', 'eine Herzkrankheit'], minAge: 50, chance: 0.025, loss: 5 },
  cancer: { name: ['cancer', 'Krebs'], minAge: 40, chance: 0.01, loss: 10, hard: true, heal: 0.05 },
};

/** Ribbons at death: the first one that fits. */
export const RIBBONS = [
  ['young', '🥀', ['Tragic', 'Tragisch']],
  ['centenarian', '🎂', ['Centenarian', 'Hundertjährig']],
  ['rich', '💰', ['Rich', 'Reich']],
  ['criminal', '🦹', ['Criminal', 'Krimineller']],
  ['scholar', '🎓', ['Scholar', 'Gelehrt']],
  ['family', '👨‍👩‍👧‍👦', ['Family person', 'Familienmensch']],
  ['lover', '💞', ['Lover', 'Herzensbrecher']],
  ['happy', '😊', ['Happy', 'Glücklich']],
  ['healthy', '💪', ['Fit', 'Fit']],
  ['average', '😐', ['Average', 'Durchschnittlich']],
];
