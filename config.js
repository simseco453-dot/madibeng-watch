// Site settings. The publishable key is meant to be public: the database rules
// in supabase/schema.sql decide what anyone can read or write.
window.MW_CONFIG = {
  supabaseUrl: "https://qvvkudfrnvtzfddmzhlk.supabase.co",
  supabaseKey: "sb_publishable_VKp9wFycWWm40FCBnb-QMQ_Ta7M_3fI",

  // Areas and their sections (blocks, zones, extensions).
  // Add the real section names to an area's list as they're confirmed, e.g.
  //   { name: "Letlhabile", sections: ["Block A", "Block B", "Zone 3"] },
  // Names below come from Madibeng Municipality outage notices. Lists aren't complete:
  // residents can pick "Other (type it)" to add one that's missing.
  areas: [
    { name: "Bapong", sections: [] },
    { name: "Brits CBD", sections: [] },
    { name: "Brits Industrial", sections: [] },
    { name: "Brits West", sections: [] },
    { name: "Damonsville", sections: [] },
    { name: "Elandsrand", sections: [] },
    { name: "Ga-Rankuwa View", sections: [] },
    { name: "Hartbeespoort", sections: ["Birdwood", "Refentse", "Sunway", "Xanadu"] },
    { name: "Ifafi", sections: [] },
    { name: "Jericho", sections: [] },
    { name: "Kosmos", sections: [] },
    { name: "Letlhabile", sections: ["Block B", "Block B Ext", "Block B Mapantsuleng", "Block C", "Block E", "Block F", "Block G", "Block H", "Block I", "Zone 4", "Zone 5", "Zone 7", "Zone 9", "Zone 10"] },
    { name: "Majakaneng", sections: [] },
    { name: "Meerhof", sections: [] },
    { name: "Mmakau", sections: [] },
    { name: "Mooinooi", sections: [] },
    { name: "Mothotlung", sections: ["Thari Section"] },
    { name: "Oukasie", sections: ["Vuka"] },
    { name: "Primindia", sections: [] },
    { name: "Schoemansville", sections: [] },
    { name: "Skeerpoort", sections: [] },
    { name: "Sonop", sections: [] }
  ]
};
