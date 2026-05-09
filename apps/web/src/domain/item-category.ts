export const itemCategoryValues = [
  "alkoholi",
  "dom_in_vrt",
  "drugo",
  "elektronika",
  "hisni_ljubljencki",
  "kava_in_caj",
  "konzervirana_zivila",
  "meso_in_perutnina",
  "mlecni_izdelki_in_jajca",
  "oblacila",
  "osebna_nega",
  "pekovski_izdelki",
  "pijace",
  "pisalne_potrebscine",
  "prigrizki_in_sladkarije",
  "pripravljeni_obroki",
  "rastlinski_izdelki",
  "ribe_in_morski_sadezi",
  "sadje_in_zelenjava",
  "suhi_izdelki",
  "za_otroke",
  "zamrznjeni_izdelki",
  "zacimbe_omake_in_olja",
  "zdravje",
  "ciscenje_in_pranje"
] as const;

export type ItemCategory = (typeof itemCategoryValues)[number];

export function isItemCategory(value: string): value is ItemCategory {
  return (itemCategoryValues as readonly string[]).includes(value);
}

function normalizeForMatch(text: string): string {
  return text
    .trim()
    .toLocaleLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ");
}

type CategorySignals = {
  strongPhrases: string[];
  phrases: string[];
  tokens: string[];
  avoid?: string[];
};

const CATEGORY_SIGNALS: Record<ItemCategory, CategorySignals> = {
  alkoholi: {
    strongPhrases: [
      "rdece vino",
      "belo vino",
      "rose vino",
      "penece vino",
      "craft beer",
      "brezalkoholno pivo",
      "temno pivo",
      "svetlo pivo",
      "gin tonic",
      "rum kola",
      "jabolcni cider",
      "viski cola"
    ],
    phrases: ["alkohol", "vino", "beer", "pivo", "whisky", "viski", "vodka", "gin", "rum", "tekila", "sampanjec", "cider", "liker", "prosecco"],
    tokens: ["aperol", "jager", "jagermeister", "martini", "bourbon", "merlot", "cabernet", "chardonnay", "rizling", "brendi"]
  },
  dom_in_vrt: {
    strongPhrases: [
      "zemlja za roze",
      "zemlja za sobne rastline",
      "vrtno orodje",
      "vrtna cev",
      "lonec za roze",
      "set za zalivanje",
      "zarnica led",
      "sesalec za listje"
    ],
    phrases: ["dom", "vrt", "garden", "orodje", "tools", "zarnica", "žarnica", "gnojilo", "sadil", "rastline", "cvetlice"],
    tokens: ["zemlja", "lopata", "grablje", "vijak", "zebelj", "žebelj", "filter", "metla", "zalivalka", "cev", "loncek", "cvetlicni"]
  },
  drugo: {
    strongPhrases: [],
    phrases: [],
    tokens: []
  },
  elektronika: {
    strongPhrases: [
      "usb kabel",
      "usb c kabel",
      "polnilec usb c",
      "sd kartica",
      "baterija aa",
      "baterija aaa",
      "brezzicne slusalke",
      "bluetooth zvocnik",
      "polnilec za telefon",
      "adapter za laptop"
    ],
    phrases: ["elektronik", "adapter", "polnilec", "charger", "kabel", "slusalke", "slušalke", "laptop", "tv", "telefon", "tablica", "prenosnik"],
    tokens: ["usb", "hdmi", "bluetooth", "miška", "miska", "tipkovnica", "powerbank", "router", "monitor", "računalnik", "racunalnik", "smartwatch", "zvocnik", "zvočnik"]
  },
  hisni_ljubljencki: {
    strongPhrases: [
      "pasja hrana",
      "mackja hrana",
      "mačja hrana",
      "pesek za macke",
      "pesek za mačke",
      "mokre brikete",
      "konzerva za psa",
      "priboljski za psa",
      "igraca za macko"
    ],
    phrases: ["hisni ljubljen", "hišni ljubljen", "pet food", "pets", "dog food", "cat food", "hrana za psa", "hrana za macko"],
    tokens: ["briketi", "macka", "mačka", "pes", "dog", "cat", "praskalnik", "povodec", "oprtnica", "posodica", "posoda", "igraca", "igrača"]
  },
  kava_in_caj: {
    strongPhrases: [
      "zeleni caj",
      "crni caj",
      "črni čaj",
      "kapsule za kavo",
      "kavna zrna",
      "instant kava",
      "turaska kava",
      "espresso kava",
      "sadni caj",
      "caj v filter vreckah"
    ],
    phrases: ["kava", "coffee", "espresso", "caj", "čaj", "tea", "cappuccino", "kapucino", "latte", "macchiato"],
    tokens: ["nescafe", "filter", "kamilica", "meta", "earl", "hibiskus", "rooibos", "matcha", "jacobs", "illy", "barcaffe", "barcaffe"],
    avoid: ["ledeni caj", "ice tea", "energijska pijaca", "proteinski shake", "cajni biskvit"]
  },
  konzervirana_zivila: {
    strongPhrases: [
      "paradiznik v konzervi",
      "tuna v konzervi",
      "koruza v konzervi",
      "fizol v konzervi",
      "grah v konzervi",
      "kompot breskev",
      "vlozene kumarice",
      "rdeca pesa v kozarcu",
      "ananas v konzervi"
    ],
    phrases: ["konzerv", "canned", "pelat", "passata", "vlozeno", "vloženo", "kompot", "v kozarcu", "v konzervi"],
    tokens: ["oliva", "olive", "kapre", "sardine", "kisle", "kisli", "pasterizirano", "kozarec", "vlozena", "vlozene", "sterilizirano"]
  },
  meso_in_perutnina: {
    strongPhrases: [
      "piscanji file",
      "piščančji file",
      "mleto meso",
      "goveje meso",
      "svinjsko meso",
      "puranje meso",
      "piscanja prsa",
      "goveji steak",
      "svinjski zrezek",
      "dimljena slanina"
    ],
    phrases: ["meso", "chicken", "beef", "pork", "turkey", "slanina", "ham", "prsut", "pršut", "perutnina", "narezek"],
    tokens: ["klobasa", "salama", "steak", "zrezek", "cevap", "ćevap", "jagnje", "telec", "pleskavica", "burger", "kebab", "hrenovka"]
  },
  mlecni_izdelki_in_jajca: {
    strongPhrases: [
      "grski jogurt",
      "grški jogurt",
      "kisla smetana",
      "jajca prosta reja",
      "mleko brez laktoze",
      "sadna skuta",
      "bela skuta",
      "skuta bela",
      "mozzarella sir",
      "mocarela sir",
      "jajca velikost m",
      "jajca velikost l",
      "svezi sirni namaz",
      "maslo brez laktoze",
      "pitni jogurt",
      "proteinski puding",
    ],
    phrases: ["mleko", "milk", "sir", "cheese", "jogurt", "yogurt", "maslo", "butter", "jajca", "jajce", "egg", "skuta", "mocarela", "mozzarella", "smetana"],
    tokens: ["skuta", "kefir", "ricotta", "mozzarella", "mocarela", "parmezan", "feta", "smetana", "puding", "edamec", "gauda", "gouda", "camembert"]
  },
  oblacila: {
    strongPhrases: [
      "zimska jakna",
      "sportna majica",
      "športna majica",
      "otroske nogavice",
      "otroške nogavice",
      "spodnje perilo",
      "tekaska majica",
      "bombažna majica"
    ],
    phrases: ["oblacil", "oblačil", "clothes", "majica", "jakna", "shirt", "pants", "hlače", "hlace", "perilo"],
    tokens: ["nogavice", "pulover", "trenirka", "copati", "cevlji", "čevlji", "kapuca", "pas", "spodnjice", "modrcek", "modrček", "plašč", "plasc"]
  },
  osebna_nega: {
    strongPhrases: [
      "gel za tusiranje",
      "gel za tuširanje",
      "zobna pasta",
      "krema za obraz",
      "dezodorant roll on",
      "sampon za lase",
      "balzam za lase",
      "pena za britje",
      "vata za obraz",
      "micelarna voda"
    ],
    phrases: ["osebna nega", "shampoo", "sampon", "šampon", "dezodorant", "toothpaste", "britvice", "kozmetika"],
    tokens: ["milo", "balzam", "pena", "krema", "serum", "ustna voda", "vatke", "robcki", "robčki", "losjon", "piling", "brivnik", "higiena"]
  },
  pekovski_izdelki: {
    strongPhrases: [
      "polnozrnat kruh",
      "toast kruh",
      "masleni rogljic",
      "masleni rogljič",
      "hamburger bombeta",
      "sveza bageta",
      "ciabatta kruh",
      "krof z marmelado"
    ],
    phrases: ["kruh", "bread", "pecivo", "bageta", "baguette", "toast", "rogljic", "rogljič", "zemljica", "bombeta"],
    tokens: ["bombeta", "focaccia", "ciabatta", "štruca", "struca", "žemlja", "zemlja", "krof", "preste", "lepinja", "bagel"]
  },
  pijace: {
    strongPhrases: [
      "mineralna voda",
      "pomarancni sok",
      "pomarančni sok",
      "proteinski napitek",
      "gazirana pijaca",
      "gazirana pijača",
      "negazirana voda",
      "vitaminska voda",
      "jabolcni sok",
      "multivitaminski sok"
    ],
    phrases: ["pijaca", "pijača", "voda", "water", "sok", "juice", "cola", "nektar", "limonada", "smoothie", "ledeni caj", "ice tea"],
    tokens: ["fanta", "sprite", "cockta", "tonik", "isostar", "sirup", "napitek", "shake", "cedevita", "radenska", "jana", "schweppes"],
    avoid: ["kava", "coffee", "caj", "čaj", "vino", "beer", "pivo", "vodka", "rum", "whisky"]
  },
  pisalne_potrebscine: {
    strongPhrases: [
      "kemicni svincnik",
      "kemični svinčnik",
      "barvni svincniki",
      "barvni svinčniki",
      "samolepilni listki",
      "a4 papir",
      "spiralni zvezek",
      "set markerjev"
    ],
    phrases: ["pisalne", "svincnik", "svinčnik", "kemicni", "kemični", "marker", "zvezek", "papir", "flomaster"],
    tokens: ["radirka", "lepilo", "mapa", "flomaster", "nalivno", "korektor", "blok", "sestilo", "ravnilo", "selotejp", "fascikel"]
  },
  prigrizki_in_sladkarije: {
    strongPhrases: [
      "mlecna cokolada",
      "mlečna čokolada",
      "slan krompircek",
      "slan krompirček",
      "gumijasti bonboni",
      "cokoladni bonboni",
      "cokoladni namaz",
      "slani prestici",
      "slane palcke"
    ],
    phrases: ["prigriz", "sladkar", "snack", "chips", "cips", "čips", "cokolad", "čokolad", "bonbon", "keks", "cookie", "candy", "vafelj", "napolitanke"],
    tokens: ["oreo", "milka", "kinder", "nutella", "pokovka", "kokice", "palcke", "palčke", "vafelj", "haribo", "twix", "snickers", "doritos"]
  },
  pripravljeni_obroki: {
    strongPhrases: [
      "instant juha",
      "gotov obrok",
      "ready meal",
      "pripravljena lazanja",
      "pripravljena pica",
      "pripravljena solata",
      "instant rezanci",
      "gotova jed",
      "mikrovalovni obrok"
    ],
    phrases: ["pripravljen", "ready to eat", "ready-to-eat", "instant obrok", "gotova jed", "sendvic", "sendvič", "tortilja wrap"],
    tokens: ["lazanja", "lasagna", "pizza", "wrap", "burrito", "obrok", "rezanci", "juha", "rižota", "rizota"]
  },
  rastlinski_izdelki: {
    strongPhrases: [
      "sojin napitek",
      "ovseno mleko",
      "mandljevo mleko",
      "veganski sir",
      "veganski burger",
      "rastlinski jogurt",
      "kokosov jogurt",
      "veganski namaz",
      "veganske klobase"
    ],
    phrases: ["rastlinsk", "plant based", "plant-based", "vegan", "veganski", "tofu", "tempeh", "seitan", "soja", "hummus", "humus"],
    tokens: ["falafel", "leca", "leča", "beljakovine", "protein vegan", "edamame", "quorn", "jackfruit", "chia", "laneno"]
  },
  ribe_in_morski_sadezi: {
    strongPhrases: [
      "svez losos",
      "svež losos",
      "dimljen losos",
      "tunjevina",
      "kozice",
      "morski sadezi",
      "morski sadeži",
      "file brancina",
      "file orade",
      "ocisceni lignji"
    ],
    phrases: ["riba", "fish", "losos", "tuna", "tun", "lignji", "hobotnica", "morski", "sardela", "skuša", "skusa"],
    tokens: ["sardina", "postrv", "brancin", "orada", "skampi", "škampi", "shrimp", "clam", "dagnje", "trska", "oslic", "lososov"]
  },
  sadje_in_zelenjava: {
    strongPhrases: [
      "sveza zelenjava",
      "sveža zelenjava",
      "sveze sadje",
      "sveže sadje",
      "cesnjev paradiznik",
      "češnjev paradižnik",
      "mesana solata",
      "zelena solata",
      "sveze jagode",
      "sveže jagode",
      "sladek krompir",
      "rdeca cebula"
    ],
    phrases: ["sadje", "zelenjava", "fruit", "vegetable", "jabol", "banan", "paradiznik", "krompir", "solata", "korenje", "paprika", "kumara", "brokoli"],
    tokens: ["cvetaca", "cvetača", "cebula", "čebula", "cesen", "česen", "avokado", "limona", "pomaranca", "pomaranča", "hruška", "hruska", "mandarina", "bučka", "bucka"]
  },
  suhi_izdelki: {
    strongPhrases: [
      "basmati riz",
      "basmati riž",
      "polnozrnate testenine",
      "ovseni kosmici",
      "ovseni kosmiči",
      "pirina moka",
      "koruzni zdrob",
      "ajdova moka",
      "jasminov riz",
      "integralni riz"
    ],
    phrases: ["riz", "riž", "rice", "testenine", "pasta", "moka", "flour", "oves", "oat", "kosmici", "kosmiči", "zdrob", "kuskus", "bulgur"],
    tokens: ["quinoa", "kvinoja", "couscous", "prosena", "ajdova", "pirin", "makaroni", "spageti", "špageti", "njoki", "rezanci", "farfalle"]
  },
  za_otroke: {
    strongPhrases: [
      "otroske plenice",
      "otroške plenice",
      "otroska hrana",
      "otroška hrana",
      "mlecna formula",
      "mlečna formula",
      "sadna kasica",
      "zelenjavna kasica",
      "otroski robcki",
      "otroški robčki"
    ],
    phrases: ["otroci", "otrok", "baby", "dojen", "plenice", "duda", "kasica", "kašica", "formula", "dojencek", "dojenček"],
    tokens: ["robcki za dojencka", "robčki za dojenčka", "flaška", "flaska", "igraca", "igrača", "vlazilni robcki", "vlažilni robčki", "dojenje", "dudka", "slinček", "slincek"]
  },
  zamrznjeni_izdelki: {
    strongPhrases: [
      "zamrznjena pizza",
      "zamrznjena zelenjava",
      "zamrznjeno sadje",
      "sladoled na palcki",
      "sladoled na palčki",
      "globoko zamrznjeno",
      "zamrznjeni pomfrit",
      "zamrznjene jagode",
      "zamrznjen grah"
    ],
    phrases: ["zamrzn", "frozen", "sladoled", "zmrzlina", "globoko zamrznjeno", "zamrznjena", "zamrznjeni"],
    tokens: ["led", "gelato", "sorbet", "pizza", "pomfri", "pomfrit", "grah", "jagode", "brokoli", "mesanica", "mešanica", "ribje palcke", "ribje palčke"]
  },
  zacimbe_omake_in_olja: {
    strongPhrases: [
      "oljcno olje",
      "oljčno olje",
      "soncnicno olje",
      "sončnično olje",
      "sojina omaka",
      "paradiznikova omaka",
      "paradižnikova omaka",
      "jabolcni kis",
      "jabolčni kis",
      "balzamicni kis",
      "balzamični kis",
      "sladka paprika"
    ],
    phrases: ["zacimb", "začimb", "spice", "omaka", "sauce", "olje", "oil", "kis", "vinegar", "ketchup", "majonez", "gorcica", "gorčica", "pesto"],
    tokens: ["origano", "bazilika", "poper", "sol", "kurkuma", "curry", "cili", "čili", "salsa", "cimet", "muskatni orescek", "muškatni orešček", "timijan", "rožmarin", "rozmarin"]
  },
  zdravje: {
    strongPhrases: [
      "vitamin c",
      "magnezijeve tablete",
      "omega 3",
      "oblizi za rane",
      "obliži za rane",
      "sirup za kaselj",
      "sirup za kašelj",
      "prehransko dopolnilo",
      "tablete proti bolecinam",
      "tablete proti bolečinam"
    ],
    phrases: ["zdravje", "vitamin", "zdravilo", "ibuprofen", "lekadol", "maska", "obliz", "obliž", "supplement", "probiotik", "dopolnilo"],
    tokens: ["paracetamol", "aspirin", "termometer", "omega", "cink", "vitamin", "multivitamin", "kolagen", "elektroliti", "imunski"]
  },
  ciscenje_in_pranje: {
    strongPhrases: [
      "prasek za perilo",
      "prašek za perilo",
      "tekoci detergent",
      "tekoči detergent",
      "mehcalec za perilo",
      "mehčalec za perilo",
      "tablete za pomivalni stroj",
      "tekocina za pomivanje posode",
      "tekočina za pomivanje posode",
      "cistilo za kopalnico",
      "čistilo za kopalnico",
      "razkuzilo za roke",
      "razkužilo za roke"
    ],
    phrases: ["ciscenje", "čiščenje", "pranje", "detergent", "mehcalec", "mehčalec", "belilo", "cistilo", "čistilo", "razkuzilo", "razkužilo", "pomivanje"],
    tokens: ["wc", "kuhinja", "steklo", "spuzva", "goba", "krpa", "vrecke", "vrečke", "sesalec", "pomivalo", "odmascevalec", "odmaščevalec", "dezinfekcija", "dezinfekcijsko"]
  }
};

const CATEGORY_PRIORITY: ItemCategory[] = [
  "kava_in_caj",
  "alkoholi",
  "pijace",
  "mlecni_izdelki_in_jajca",
  "meso_in_perutnina",
  "ribe_in_morski_sadezi",
  "sadje_in_zelenjava",
  "pekovski_izdelki",
  "suhi_izdelki",
  "konzervirana_zivila",
  "zamrznjeni_izdelki",
  "prigrizki_in_sladkarije",
  "zacimbe_omake_in_olja",
  "rastlinski_izdelki",
  "pripravljeni_obroki",
  "osebna_nega",
  "ciscenje_in_pranje",
  "zdravje",
  "za_otroke",
  "hisni_ljubljencki",
  "pisalne_potrebscine",
  "oblacila",
  "elektronika",
  "dom_in_vrt",
  "drugo"
];

function tokenize(text: string): string[] {
  return text
    .split(" ")
    .map((token) => token.trim())
    .filter(Boolean);
}

function uniqueTokens(tokens: string[]): string[] {
  return Array.from(new Set(tokens));
}

function boundedLevenshtein(a: string, b: string, maxDistance = 1): number {
  const lengthDiff = Math.abs(a.length - b.length);
  if (lengthDiff > maxDistance) {
    return maxDistance + 1;
  }

  const dp = new Array(b.length + 1);
  for (let j = 0; j <= b.length; j += 1) {
    dp[j] = j;
  }

  for (let i = 1; i <= a.length; i += 1) {
    let prevDiagonal = dp[0];
    dp[0] = i;
    let rowMin = dp[0];

    for (let j = 1; j <= b.length; j += 1) {
      const oldTop = dp[j];
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prevDiagonal + cost);
      prevDiagonal = oldTop;
      if (dp[j] < rowMin) {
        rowMin = dp[j];
      }
    }

    if (rowMin > maxDistance) {
      return maxDistance + 1;
    }
  }

  return dp[b.length];
}

function tokenMatchScore(token: string, candidate: string): number {
  if (token === candidate) {
    return 1;
  }

  if (token.startsWith(candidate) || candidate.startsWith(token)) {
    const minLength = Math.min(token.length, candidate.length);
    if (minLength >= 4) {
      return 0.72;
    }
  }

  if (token.length >= 5 && candidate.length >= 5 && boundedLevenshtein(token, candidate, 1) <= 1) {
    return 0.58;
  }

  return 0;
}

function containsPhrase(haystack: string, phrase: string): boolean {
  const normalizedPhrase = normalizeForMatch(phrase);
  return normalizedPhrase.length > 0 && haystack.includes(normalizedPhrase);
}

function scoreCategory(haystack: string, tokens: string[], signals: CategorySignals): number {
  let score = 0;

  for (const phrase of signals.strongPhrases) {
    if (containsPhrase(haystack, phrase)) {
      score += 9;
    }
  }

  for (const phrase of signals.phrases) {
    if (containsPhrase(haystack, phrase)) {
      score += 5;
    }
  }

  const normalizedTokens = uniqueTokens(tokens.map((token) => normalizeForMatch(token)).filter(Boolean));
  const candidateTokens = uniqueTokens(signals.tokens.map((token) => normalizeForMatch(token)).filter(Boolean));

  for (const token of normalizedTokens) {
    let tokenBest = 0;
    for (const candidate of candidateTokens) {
      tokenBest = Math.max(tokenBest, tokenMatchScore(token, candidate));
      if (tokenBest >= 1) {
        break;
      }
    }

    if (tokenBest >= 1) {
      score += 2.5;
    } else if (tokenBest >= 0.72) {
      score += 1.6;
    } else if (tokenBest >= 0.58) {
      score += 0.9;
    }
  }

  for (const avoidPhrase of signals.avoid ?? []) {
    if (containsPhrase(haystack, avoidPhrase)) {
      score -= 3;
    }
  }

  return score;
}

export function inferCategoryFromTitle(title: string): ItemCategory {
  const haystack = normalizeForMatch(title);
  if (!haystack) {
    return "drugo";
  }

  const tokens = tokenize(haystack);
  if (tokens.length === 0) {
    return "drugo";
  }

  let bestCategory: ItemCategory = "drugo";
  let bestScore = 0;

  for (const category of CATEGORY_PRIORITY) {
    if (category === "drugo") {
      continue;
    }

    const signals = CATEGORY_SIGNALS[category];
    const score = scoreCategory(haystack, tokens, signals);

    if (score > bestScore + 0.35) {
      bestScore = score;
      bestCategory = category;
    }
  }

  return bestScore >= 3.2 ? bestCategory : "drugo";
}
