// Project settings. Edit these if anything changes.

export const firebaseConfig = {
  apiKey: "AIzaSyAXhcwjRtKftBps0_6SxBjSwx6C8dxxvxw",
  authDomain: "schedule-56059.firebaseapp.com",
  projectId: "schedule-56059",
  storageBucket: "schedule-56059.firebasestorage.app",
  messagingSenderId: "526831333425",
  appId: "1:526831333425:web:66fa0175a932ce983c6510",
  measurementId: "G-B4XC5WL1Q3"
};

export const APP = {
  title: "Project 269 Control Centre",
  subtitle: "Altona Refinery Demolition",
  client: "ExxonMobil Altona",
  lookaheadDays: 21,      // how far ahead the board and attention list look
  workplanWarnDays: 7,    // warn when a task starts within this many days without an approved workplan
  drawingWarnDays: 14,    // warn when drawings are missing this close to the start
  lagWarnPct: 25          // warn when planned % is ahead of actual % by this much
};

// Tags shown in the filters, in this order.
export const TAGS = [
  { key: "heaters",   label: "Heaters",                    hue: 14  },
  { key: "burners",   label: "Burners",                    hue: 32  },
  { key: "asbestos",  label: "Asbestos Removal",           hue: 48  },
  { key: "scaffold",  label: "Scaffold",                   hue: 190 },
  { key: "demo",      label: "Demolition",                 hue: 355 },
  { key: "pipe",      label: "Pipework and Piperack",      hue: 210 },
  { key: "purple",    label: "Purple Items",               hue: 275 },
  { key: "blending",  label: "Blending Area",              hue: 160 },
  { key: "bitumen",   label: "Bitumen Area",               hue: 30  },
  { key: "boiler",    label: "Boiler House",               hue: 240 },
  { key: "blast",     label: "Stack Explosive Blast Event", hue: 0  },
  { key: "scrap",     label: "Scrap Processing",           hue: 95  },
  { key: "offsite",   label: "Offsite and Bridge works",   hue: 125 },
  { key: "untagged",  label: "Untagged",                   hue: 220 }
];
