// Site settings. The publishable key is meant to be public: the database rules
// in supabase/schema.sql decide what anyone can read or write.
window.MW_CONFIG = {
  supabaseUrl: "https://qvvkudfrnvtzfddmzhlk.supabase.co",
  supabaseKey: "sb_publishable_VKp9wFycWWm40FCBnb-QMQ_Ta7M_3fI",

  // Areas and their sections (blocks, zones, extensions).
  // Add the real section names to an area's list as they're confirmed, e.g.
  //   { name: "Letlhabile", sections: ["Block A", "Block B", "Zone 3"] },
  // While an area's list is empty, residents can type their own section name.
  areas: [
    { name: "Bapong", sections: [] },
    { name: "Brits CBD", sections: [] },
    { name: "Brits Industrial", sections: [] },
    { name: "Brits West", sections: [] },
    { name: "Damonsville", sections: [] },
    { name: "Elandsrand", sections: [] },
    { name: "Ga-Rankuwa View", sections: [] },
    { name: "Hartbeespoort", sections: [] },
    { name: "Ifafi", sections: [] },
    { name: "Jericho", sections: [] },
    { name: "Kosmos", sections: [] },
    { name: "Letlhabile", sections: [] },
    { name: "Majakaneng", sections: [] },
    { name: "Meerhof", sections: [] },
    { name: "Mmakau", sections: [] },
    { name: "Mooinooi", sections: [] },
    { name: "Mothotlung", sections: [] },
    { name: "Oukasie", sections: [] },
    { name: "Primindia", sections: [] },
    { name: "Schoemansville", sections: [] },
    { name: "Skeerpoort", sections: [] },
    { name: "Sonop", sections: [] }
  ]
};
