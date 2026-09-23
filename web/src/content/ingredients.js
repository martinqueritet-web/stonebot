/**
 * Editorial content for each ingredient, from the top of the burger down.
 * Identified visually from the reference photo; edit freely to match the
 * real recipe (the 3D scene only relies on the `id`).
 */
export const INGREDIENTS = [
  {
    id: 'bun_top',
    name: 'Pain brioché au sésame',
    tagline: 'Dôme doré, dorure à l’œuf',
    description:
      'Une brioche moelleuse badigeonnée à l’œuf avant cuisson, d’où son dôme brillant et acajou. Couverte de graines de sésame blanc et toastée côté mie pour garder son croquant.',
    facts: [
      ['Croûte', 'Dorure à l’œuf, brillante'],
      ['Graines', 'Sésame blanc'],
      ['Mie', 'Toastée à la plancha'],
    ],
  },
  {
    id: 'pickles',
    name: 'Pickles à l’aneth',
    tagline: 'Acidité et croquant',
    description:
      'Des rondelles de cornichon à l’aneth, posées juste sous le pain. Leur pointe vinaigrée vient couper le gras du bœuf et du fromage.',
    facts: [
      ['Coupe', 'Rondelles épaisses'],
      ['Saveur', 'Vinaigre, aneth, ail'],
      ['Rôle', 'Contraste acide'],
    ],
  },
  {
    id: 'sauce',
    name: 'Sauce burger maison',
    tagline: 'Crémeuse, légèrement relevée',
    description:
      'Une sauce onctueuse de couleur orangée, piquée de poivre : l’accord classique mayonnaise, moutarde et condiments, qui nappe le fromage et imbibe le pain.',
    facts: [
      ['Base', 'Émulsion mayo-moutarde'],
      ['Relevé', 'Poivre noir, paprika'],
      ['Texture', 'Nappante'],
    ],
  },
  {
    id: 'cheese_top',
    name: 'Cheddar fondu',
    tagline: 'Fondu sous cloche',
    description:
      'Une tranche de cheddar américain posée sur le steak encore sur la plaque. Elle fond en quelques secondes et coule sur les bords.',
    facts: [
      ['Type', 'Cheddar américain'],
      ['Fonte', 'Sous cloche, quelques secondes'],
      ['Rôle', 'Liant crémeux'],
    ],
  },
  {
    id: 'patty_top',
    name: 'Steak smashé',
    tagline: 'Croûte caramélisée',
    description:
      'Une boule de bœuf haché écrasée d’un coup sec sur la plaque brûlante. Le contact maximal avec le métal crée une croûte profonde (réaction de Maillard) et des bords dentelés croustillants.',
    facts: [
      ['Cuisson', 'Plancha très chaude'],
      ['Assaisonnement', 'Sel, poivre noir concassé'],
      ['Bords', 'Dentelés, croustillants'],
    ],
  },
  {
    id: 'cheese_bottom',
    name: 'Second cheddar',
    tagline: 'Entre les deux steaks',
    description:
      'La deuxième tranche, prise en sandwich entre les deux steaks. En fondant, elle les soude l’un à l’autre.',
    facts: [
      ['Type', 'Cheddar américain'],
      ['Position', 'Entre les deux smashs'],
      ['Effet', 'Fondant à cœur'],
    ],
  },
  {
    id: 'patty_bottom',
    name: 'Second steak smashé',
    tagline: 'Double épaisseur de goût',
    description:
      'Le second smash, saisi de la même façon. Deux steaks fins donnent deux fois plus de croûte qu’un seul steak épais.',
    facts: [
      ['Cuisson', 'Saisi puis retourné'],
      ['Croûte', 'Deux faces caramélisées'],
      ['Jus', 'Absorbé par les oignons'],
    ],
  },
  {
    id: 'onions',
    name: 'Oignons fondants',
    tagline: 'Confits sur la plaque',
    description:
      'Des oignons blancs émincés, cuits sur la plaque dans le jus du steak jusqu’à devenir translucides, doux et légèrement caramélisés.',
    facts: [
      ['Variété', 'Oignon blanc'],
      ['Cuisson', 'Plancha, dans le jus'],
      ['Saveur', 'Douce, sucrée'],
    ],
  },
  {
    id: 'bun_bottom',
    name: 'Talon brioché toasté',
    tagline: 'La base qui tient tout',
    description:
      'La base de la brioche, toastée côté mie. Elle absorbe les jus sans se détremper et porte tout l’édifice.',
    facts: [
      ['Mie', 'Toastée, dorée'],
      ['Croûte', 'Brillante, souple'],
      ['Rôle', 'Absorbe les jus'],
    ],
  },
];

export const byId = Object.fromEntries(INGREDIENTS.map((it, i) => [it.id, { ...it, index: i + 1 }]));
