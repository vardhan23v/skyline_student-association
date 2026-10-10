/**
 * All content for the public landing page ("/").
 * Upcoming events are the club's real line-up. Past events, merch prices and stats are
 * placeholder copy. Past-event and gallery photos are free-licence Unsplash stand-ins
 * (credits below); merch photos are the club's own product mockups. Replace any photo by
 * overwriting the file under public/media/ with the same name.
 * Merch videos: drop `<item>.mp4` into public/media/merch/; until then the poster image shows.
 */

export type NavLink = { id: SectionId; label: string };
export type SectionId = 'events' | 'past' | 'merch' | 'about' | 'gallery' | 'join';

export const navLinks: NavLink[] = [
  { id: 'events', label: 'Events' },
  { id: 'merch', label: 'Merch' },
  { id: 'about', label: 'About' },
  { id: 'gallery', label: 'Gallery' },
  { id: 'join', label: 'Join' },
];

export const hero = {
  script: 'Skyline',
  title: 'Student Association',
  tagline: 'Many students, one horizon.',
  subline: 'Events, community and everything the club does — in one place.',
  primaryCta: { label: 'Explore events', href: '#events' },
  secondaryCta: { label: 'Join the club', href: '#join' },
};

export type EventCategory = 'Technical' | 'Non-technical' | 'Technical · Business';
export type UpcomingEvent = {
  id: string;
  title: string;
  category: EventCategory;
  date: string;
  venue: string;
  description: string;
  duration: string;
  /** Team size or participation format, shown as "<label>: <value>". */
  format: { label: 'Team size' | 'Participation'; value: string };
  href: string;
};
/**
 * Upcoming events. No photos on purpose: these haven't happened yet, so any photo would be
 * stock posing as the event. Swap in an official poster later by adding an `image` field.
 * `href` points at the events list; change to `/events/<id>` once each exists in the admin.
 */
export const upcomingEvents: UpcomingEvent[] = [
  {
    id: 'codestorm-2026', title: 'CodeStorm 2026', category: 'Technical', date: '2026-10-24', venue: 'Main Auditorium',
    description: 'A 24-hour hackathon where students collaborate to build innovative solutions to real-world problems using software development, AI and emerging technologies. Teams present their prototypes to a panel of judges.',
    duration: '24 hours', format: { label: 'Team size', value: '2–4 members' }, href: '/events',
  },
  {
    id: 'tech-trivia', title: 'Tech Trivia', category: 'Technical', date: '2026-10-28', venue: 'Seminar Hall 2',
    description: 'Test your knowledge of programming, computer science, cybersecurity and technology trends across multiple rounds, from rapid-fire questions to problem-solving tasks.',
    duration: '2 hours', format: { label: 'Participation', value: 'Individual' }, href: '/events',
  },
  {
    id: 'rhythm-unplugged', title: 'Rhythm Unplugged', category: 'Non-technical', date: '2026-10-31', venue: 'Open-Air Theatre',
    description: 'A vibrant celebration of music, dance and artistic expression, with solo performances, group dance battles and live musical acts.',
    duration: '3 hours', format: { label: 'Participation', value: 'Solo and group' }, href: '/events',
  },
  {
    id: 'lenscape', title: 'Lenscape: Photography Challenge', category: 'Non-technical', date: '2026-11-04', venue: 'College Campus',
    description: 'Capture stories through your lens across campus life, nature, architecture and candid moments. Entries are judged on creativity, composition and storytelling.',
    duration: '4 hours', format: { label: 'Participation', value: 'Individual' }, href: '/events',
  },
  {
    id: 'innovatex', title: 'InnovateX: Startup Pitch', category: 'Technical · Business', date: '2026-11-07', venue: 'Innovation Centre',
    description: 'Turn bold ideas into compelling pitches. Teams present products, services or technology-driven solutions to a judging panel, showing problem-solving, market understanding and entrepreneurial thinking.',
    duration: '3 hours', format: { label: 'Team size', value: '2–3 members' }, href: '/events',
  },
];

export type PastEvent = { title: string; date: string; venue: string; description: string; image: string; alt: string };
/**
 * Past events. Placeholder write-ups; photos are free-licence Unsplash images (unsplash.com/license),
 * stand-ins until the club's own photos replace public/media/past/past-<n>.jpg. Sources:
 * 1 ZbiLAi2BtiU · 2 LtE6W_JVTGc · 3 tqe1jIgyhhs · 4 mbGBTpCi5qQ · 5 2uX_7L_10rM · 6 FQqRVH1EVjg (unsplash.com/photos/<id>)
 */
export const pastEvents: PastEvent[] = [
  { title: 'Garba & Dandiya Night 2025', date: '2025-09-27', venue: 'Open-Air Theatre', description: 'Navratri on campus: garba circles, dandiya and a costume showcase that ran past midnight.', image: '/media/past/past-1.jpg', alt: 'Folk dancers in bright traditional costumes performing outdoors' },
  { title: 'Holi Utsav', date: '2026-03-04', venue: 'Central Lawn', description: 'Organic colours, a dhol circle and a campus-wide colour run to welcome spring.', image: '/media/past/past-2.jpg', alt: 'Crowd throwing coloured powder into the air at Holi' },
  { title: 'Skyline Fest: Closing Night', date: '2026-02-21', venue: 'Main Grounds', description: 'The annual fest signed off with a headline set and fireworks over a packed crowd.', image: '/media/past/past-3.jpg', alt: 'Fireworks above a concert stage and a packed crowd' },
  { title: 'Natya: Classical Dance Showcase', date: '2026-01-26', venue: 'Main Auditorium', description: 'Bharatanatyam, Kathak and Odissi solos from students across departments.', image: '/media/past/past-4.jpg', alt: 'A dancer in traditional costume performing a classical Indian dance on stage' },
  { title: 'CodeStorm 2025: Kick-off', date: '2025-10-18', venue: 'Seminar Hall 2', description: 'Problem statements, team formation and mentor intros for last year\'s 24-hour hackathon.', image: '/media/past/past-5.jpg', alt: 'Students seated in a seminar hall facing a projector screen' },
  { title: 'Convocation 2025', date: '2025-08-30', venue: 'Convention Hall', description: 'Caps, gowns and proud families as the class of 2025 graduated.', image: '/media/past/past-6.jpg', alt: 'Graduates in caps and gowns posing together' },
];

export type MerchItem = { id: string; name: string; price: string; image: string; video: string; alt: string };
export const merch: MerchItem[] = [
  { id: 'tshirt', name: 'T-shirt', price: '₹499', image: '/media/merch/tshirt.jpg', video: '/media/merch/tshirt.mp4', alt: 'Black T-shirt with the orange Skyline logo on the chest' },
  { id: 'bag', name: 'Bag', price: '₹299', image: '/media/merch/bag.jpg', video: '/media/merch/bag.mp4', alt: 'White tote bag with the orange Skyline logo' },
  { id: 'bottle', name: 'Water bottle', price: '₹399', image: '/media/merch/bottle.jpg', video: '/media/merch/bottle.mp4', alt: 'Black sports bottle with the orange Skyline logo' },
  { id: 'stickers', name: 'Stickers', price: '₹99', image: '/media/merch/stickers.jpg', video: '/media/merch/stickers.mp4', alt: 'Skyline logo sticker' },
];
export const merchShopHref = '/shop';

export const about = {
  paragraph:
    'Skyline Student Association is run by students, for students. We host the events that fill the campus calendar, manage events on behalf of the college, run memberships, and keep the club’s finances open for anyone to read.',
  features: [
    { icon: 'ticket', title: 'Host events', body: 'Venues, ticketing and QR check-in at the door.' },
    { icon: 'clipboard', title: 'Manage events for the college', body: 'Planning, volunteers and budgets, end to end.' },
    { icon: 'scale', title: 'Transparent club', body: 'Every rupee tracked in a public ledger.' },
  ] as const,
};

export type Stat = { label: string; value: number; prefix?: string; suffix?: string; decimals?: number };
export const stats: Stat[] = [
  { label: 'Events hosted', value: 48, suffix: '+' },
  { label: 'Members', value: 1200, suffix: '+' },
  { label: 'Volunteers', value: 85 },
  { label: 'Funds raised', value: 3.2, prefix: '₹', suffix: 'L', decimals: 1 },
];

export type GalleryPhoto = { image: string; alt: string };
/** Free-licence Unsplash stand-ins (unsplash.com/license) until the club's own photos replace public/media/gallery/moment-<n>.jpg. */
export const gallery: GalleryPhoto[] = [
  'Fest crowd under a canopy of coloured streamers',
  'Night fest on campus with a packed crowd',
  'A huge crowd gathered for a campus event',
  'Students cheering at an evening concert',
  'Tricolour canopy over a festive gathering',
  'Students in traditional sarees on campus',
  'Students working through a written round',
  'Holi celebrations with coloured powder',
  'Two dancers in traditional costume under festival lights',
  'Classical dancers performing outdoors',
  'A student speaking at a campus talk',
  'Diyas lit for Diwali',
].map((alt, i) => ({ image: `/media/gallery/moment-${i + 1}.jpg`, alt }));

export const join = {
  script: 'join',
  title: 'Skyline',
  benefits: ['member ticket prices', 'merch discounts', 'vote in club decisions'],
};

export const socials = [
  { label: 'Instagram', icon: 'instagram', href: '#' },
  { label: 'LinkedIn', icon: 'linkedin', href: '#' },
  { label: 'YouTube', icon: 'youtube', href: '#' },
  { label: 'Email', icon: 'mail', href: 'mailto:ssa@example.com' },
] as const;
