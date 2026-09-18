"use strict";

/*
  A QUINTA SOMBRA — 0.1.0

  Base incremental em Canvas.
  Sem bibliotecas ou imagens externas.

  Abertura, exploração da casa e primeira busca por alimento.
  Arte provisória: personagens e cenários serão refinados depois.

  Continuaremos editando este mesmo arquivo.
*/

(() => {
  // =========================================================
  // CONFIGURAÇÃO E ESTADO
  // =========================================================

  const $ = id => document.getElementById(id);
  const canvas = $("canvas");
  const c = canvas.getContext("2d");

  const W = 480;
  const H = 270;
  const SAVE = "a-quinta-sombra-save-v1";

  const keys = new Set();

  let mode = "menu";
  let state = null;
  let dialog = null;
  let camera = { x: 0, y: 0 };
  let elapsed = 0;
  let last = 0;
  let transitionBusy = false;
  let near = null;
  let messageTime = 0;
  let saveAvailable = false;

  try {
    saveAvailable = !!localStorage.getItem(SAVE);
  } catch {}

  $("continue").hidden = !saveAvailable;

  const objectives = {
    prologue: "Siga com sua esposa até o portão norte.",
    parents: "Verifique o quarto dos seus pais.",
    meal: "Pegue a comida na cozinha.",
    feed: "Leve a comida ao seu irmão.",
    sleep: "Volte ao seu quarto e tente dormir.",
    check: "Procure seus pais novamente.",
    empty: "Verifique a comida na cozinha.",
    talk: "Converse com seu irmão.",
    key: "Procure a chave reserva no sótão.",
    exit: "Abra a porta de entrada.",
    supplies: "Procure alimento na venda da vila.",
    return: "Leve o alimento para seu irmão.",
    free: "Explore a vila. A abertura foi concluída."
  };

  const roomNames = {
    bedroom: "Seu quarto",
    brother: "Quarto do irmão",
    parents: "Quarto dos pais",
    hall: "Andar superior",
    foyer: "Entrada da casa",
    kitchen: "Cozinha",
    living: "Sala",
    attic: "Sótão",
    village: "Vila · exterior"
  };

  function initial() {
    return {
      schema: 1,
      room: "village",
      x: 500,
      y: 690,
      stage: "prologue",
      minutes: 14 * 60,
      day: 0,
      food: 0,
      key: false,
      firstExit: false,
      finished: false,
      rain: false,
      facing: "down",
      walk: 0
    };
  }

  // =========================================================
  // MAPAS E OBJETOS
  // =========================================================

  const maps = {};

  function room(id, objects, doors) {
    maps[id] = {
      w: 640,
      h: 420,
      objects,
      doors
    };
  }

  const obj = (x, y, w, h, type, label, action) => ({
    x, y, w, h, type, label, action
  });

  const door = (x, y, to, tx, ty, label, action) => ({
    x, y, to, tx, ty, label, action
  });

  room(
    "bedroom",
    [
      obj(280, 70, 88, 130, "bed", "Cama", "bed"),
      obj(397, 90, 40, 40, "lamp"),
      obj(270, 280, 140, 55, "rug"),
      obj(65, 78, 90, 40, "shelf")
    ],
    [
      door(90, 46, "hall", 490, 325, "Sair do quarto")
    ]
  );

  room(
    "brother",
    [
      obj(
        290, 75, 88, 135,
        "brotherbed",
        "Conversar com seu irmão",
        "brother"
      ),
      obj(408, 90, 40, 40, "lamp"),
      obj(100, 90, 90, 40, "shelf"),
      obj(255, 285, 140, 55, "rug")
    ],
    [
      door(490, 46, "hall", 160, 325, "Sair do quarto")
    ]
  );

  room(
    "parents",
    [
      obj(245, 90, 145, 140, "bed", "Investigar a cama", "parents"),
      obj(415, 100, 40, 40, "lamp"),
      obj(80, 100, 95, 45, "shelf"),
      obj(255, 290, 130, 50, "rug")
    ],
    [
      door(485, 46, "foyer", 175, 325, "Voltar à entrada")
    ]
  );

  room(
    "hall",
    [
      obj(275, 70, 70, 38, "table"),
      obj(400, 65, 125, 95, "stairs", "Descer a escada", "down")
    ],
    [
      door(160, 374, "brother", 490, 85, "Quarto do irmão"),
      door(490, 374, "bedroom", 90, 85, "Seu quarto"),
      door(45, 215, null, 0, 0, "Banheiro", "bath"),
      door(240, 46, "attic", 310, 315, "Subir ao sótão")
    ]
  );

  room(
    "foyer",
    [
      obj(410, 80, 125, 150, "stairs", "Subir a escada", "up"),
      obj(230, 230, 90, 50, "rug"),
      obj(75, 100, 55, 40, "lamp")
    ],
    [
      door(260, 46, "kitchen", 310, 320, "Cozinha"),
      door(480, 46, null, 0, 0, "Porta do porão", "basement"),
      door(45, 215, "living", 530, 210, "Sala"),
      door(175, 374, "parents", 485, 90, "Quarto dos pais"),
      door(595, 305, null, 0, 0, "Porta de entrada", "outside")
    ]
  );

  room(
    "kitchen",
    [
      obj(110, 70, 230, 45, "counter", "Procurar comida", "food"),
      obj(420, 85, 60, 65, "stove"),
      obj(245, 210, 120, 60, "table"),
      obj(70, 250, 60, 45, "shelf")
    ],
    [
      door(310, 374, "foyer", 260, 90, "Voltar à entrada")
    ]
  );

  room(
    "living",
    [
      obj(120, 120, 70, 130, "sofa"),
      obj(280, 170, 90, 70, "table"),
      obj(290, 70, 100, 40, "shelf", "Observar a fotografia", "photo"),
      obj(420, 95, 40, 40, "lamp"),
      obj(230, 260, 170, 55, "rug")
    ],
    [
      door(595, 210, "foyer", 90, 215, "Voltar à entrada")
    ]
  );

  room(
    "attic",
    [
      obj(115, 100, 85, 55, "chest", "Vasculhar o baú", "key"),
      obj(370, 100, 80, 50, "crate"),
      obj(450, 190, 70, 60, "crate"),
      obj(240, 80, 60, 55, "crate")
    ],
    [
      door(310, 374, "hall", 240, 90, "Descer ao corredor")
    ]
  );

  maps.village = {
    w: 1000,
    h: 840,

    objects: [
      obj(375, 460, 250, 180, "house"),

      obj(
        110, 230, 185, 150,
        "shop",
        "Examinar a caixa da venda",
        "supply"
      ),

      obj(715, 280, 180, 140, "building"),
      obj(435, 235, 130, 65, "fountain"),
      obj(90, 570, 180, 145, "building"),
      obj(725, 590, 180, 130, "building"),
      obj(410, 75, 180, 35, "gate", "Portão norte", "gate")
    ],

    doors: [
      door(500, 662, null, 0, 0, "Entrar em casa", "home")
    ]
  };

  // =========================================================
  // FERRAMENTAS DE DESENHO
  // =========================================================

  function rect(x, y, w, h, color) {
    c.fillStyle = color;
    c.fillRect(Math.round(x), Math.round(y), w, h);
  }

  function txt(text, x, y, color = "#d3c6a5", size = 8) {
    c.fillStyle = color;
    c.font = `${size}px monospace`;
    c.fillText(text, Math.round(x), Math.round(y));
  }

  function hash(x, y) {
    return Math.abs(Math.sin(x * 127.1 + y * 311.7) * 43758.5453) % 1;
  }

  // =========================================================
  // PERSONAGENS PROVISÓRIOS
  // =========================================================

  function person(
    x,
    y,
    kind = "player",
    walk = 0,
    face = "down",
    scale = 1
  ) {
    c.save();
    c.translate(Math.round(x), Math.round(y));
    c.scale(scale, scale);

    const skin = kind === "mother" ? "#c6967b" : "#bc9071";

    const shirt = {
      player: "#587a78",
      father: "#665d49",
      mother: "#8e5960",
      brother: "#a58757"
    }[kind];

    const leg = Math.sin(walk) * 2;

    rect(-7, 0, 14, 3, "#080d1290");

    rect(-4, -10, 4, 10 + leg, "#29303d");
    rect(1, -10, 4, 10 - leg, "#29303d");

    rect(-6, -20, 12, 13, shirt);

    rect(-9, -19, 3, 10, skin);
    rect(6, -19, 3, 10, skin);

    rect(-5, -30, 10, 11, skin);
    rect(-6, -32, 12, 5, "#392c2a");

    if (kind === "mother") {
      rect(-7, -29, 3, 13, "#392c2a");
      rect(5, -29, 3, 13, "#392c2a");
    }

    if (face !== "up") {
      rect(face === "left" ? -5 : -2, -25, 2, 2, "#1a232a");

      if (face === "down") {
        rect(3, -25, 2, 2, "#1a232a");
      }
    }

    if (kind === "player" || kind === "brother") {
      rect(-5, -21, 2, 2, "#b5d8c8");
    }

    c.restore();
  }

  // =========================================================
  // MÓVEIS
  // =========================================================

  function furnishing(o) {
    const { x, y, w, h, type } = o;

    rect(x + 5, y + h - 4, w, 8, "#0005");

    if (type === "rug") {
      rect(x, y, w, h, "#51423a");
      rect(x + 4, y + 4, w - 8, h - 8, "#79634b");

      for (let i = 8; i < w; i += 12) {
        rect(x + i, y + 8, 3, h - 16, "#564739");
      }

      return;
    }

    if (type === "bed" || type === "brotherbed") {
      rect(x, y, w, h, "#3b2927");
      rect(x + 5, y + 8, w - 10, h - 16, "#ac9a77");
      rect(x + 10, y + 12, w - 20, 23, "#cdc3a1");

      rect(
        x + 6,
        y + 43,
        w - 12,
        h - 48,
        type === "brotherbed" ? "#817044" : "#405b60"
      );

      for (let i = 15; i < w - 10; i += 16) {
        rect(x + i, y + 47, 2, h - 59, "#ffffff10");
      }

      if (type === "brotherbed") {
        person(x + w / 2, y + 58, "brother", 0, "down", 0.8);
      }

      return;
    }

    if (type === "stairs") {
      rect(x, y, w, h, "#202527");

      for (let n = 0; n < h; n += 15) {
        rect(x + 7, y + n, w - 14, 12, "#6d6050");
        rect(x + 7, y + n + 11, w - 14, 2, "#292b2a");
      }

      rect(x, y, 5, h, "#a18a66");
      rect(x + w - 5, y, 5, h, "#a18a66");
      return;
    }

    rect(x, y, w, h, type === "sofa" ? "#4a5551" : "#49392e");

    rect(
      x + 3,
      y + 3,
      w - 6,
      h - 9,
      type === "stove" ? "#555956" : "#80664b"
    );

    rect(x + 3, y + h - 6, w - 6, 5, "#312923");

    if (type === "lamp") {
      rect(x + w / 2 - 2, y + 8, 4, 21, "#322d27");
      rect(x + w / 2 - 12, y + 3, 24, 12, "#d2b36d");

      const glow = c.createRadialGradient(
        x + w / 2, y + 8, 2,
        x + w / 2, y + 8, 65
      );

      glow.addColorStop(0, "#eac07935");
      glow.addColorStop(1, "#eac07900");

      c.fillStyle = glow;
      c.fillRect(x - 60, y - 60, 160, 160);
    }

    if (type === "shelf" || type === "counter") {
      const colors = ["#556a65", "#9d805d", "#6b5559"];

      for (let i = 9; i < w - 10; i += 19) {
        rect(
          x + i,
          y + 8,
          9,
          16,
          colors[Math.floor(i / 19) % 3]
        );
      }
    }

    if (type === "chest") {
      rect(x, y + 10, w, 5, "#ad8d52");
      rect(x + w / 2 - 4, y + 15, 8, 10, "#b49a61");
    }

    if (type === "crate") {
      rect(x + 9, y + 6, 4, h - 17, "#a18659");
      rect(x + w - 12, y + 6, 4, h - 17, "#a18659");
    }
  }

  // =========================================================
  // CONSTRUÇÕES DA VILA
  // =========================================================

  function building(o) {
    const { x, y, w, h, type } = o;

    if (type === "fountain") {
      rect(x, y, w, h, "#696e65");
      rect(x + 7, y + 7, w - 14, h - 14, "#35585c");

      for (let i = 0; i < 6; i++) {
        rect(
          x + 15 + i * 17,
          y + 15 + Math.sin(elapsed + i) * 8,
          9,
          2,
          "#81a5a0"
        );
      }

      return;
    }

    if (type === "gate") {
      rect(x, y, w, 12, "#716850");
      rect(x, y, 12, 70, "#484d48");
      rect(x + w - 12, y, 12, 70, "#484d48");

      for (let i = 20; i < w; i += 15) {
        rect(x + i, y + 12, 4, 52, "#545650");
      }

      return;
    }

    rect(x + 7, y + 20, w, h, "#060d1644");
    rect(x, y + 30, w, h - 30, "#6e6b58");

    for (let j = 40; j < h; j += 16) {
      for (let i = 5; i < w - 10; i += 25) {
        rect(
          x + i + (j % 32 ? 5 : 0),
          y + j,
          19,
          11,
          "#777260"
        );
      }
    }

    rect(x - 10, y, w + 20, 55, "#34434a");

    for (let j = 3; j < 50; j += 9) {
      for (let i = 0; i < w; i += 18) {
        rect(x + i, y + j, 15, 5, "#47565a");
      }
    }

    rect(x + w / 2 - 18, y + h - 49, 36, 49, "#382e29");

    for (const wx of [x + 24, x + w - 51]) {
      rect(wx, y + 72, 28, 31, "#292f30");

      rect(
        wx + 3,
        y + 75,
        22,
        25,
        state && state.stage === "prologue"
          ? "#a8b3a1"
          : "#b29b5e"
      );

      rect(wx + 13, y + 73, 2, 29, "#343732");
      rect(wx, y + 87, 28, 2, "#343732");
    }

    if (type === "shop") {
      rect(x + 20, y + 48, w - 40, 16, "#282f30");
      txt("VENDA", x + 64, y + 60, "#d0ba85", 10);
      rect(x + w / 2 - 30, y + h + 2, 60, 22, "#85684a");
    }
  }

  // =========================================================
  // RENDERIZAÇÃO DO MUNDO E CÂMERA
  // =========================================================

  function drawWorld() {
    const m = maps[state.room];

    camera.x = Math.max(
      0,
      Math.min(m.w - W, state.x - W / 2)
    );

    camera.y = Math.max(
      0,
      Math.min(m.h - H, state.y - H / 2)
    );

    c.save();
    c.translate(-Math.floor(camera.x), -Math.floor(camera.y));

    if (state.room === "village") {
      rect(0, 0, m.w, m.h, "#34463b");

      for (let y = 0; y < m.h; y += 12) {
        for (let x = 0; x < m.w; x += 16) {
          const z = hash(x, y);

          if (z > 0.65) {
            rect(
              x, y, 3, 2,
              z > 0.8 ? "#667350" : "#233d34"
            );
          }
        }
      }

      rect(466, 0, 68, 840, "#777260");
      rect(0, 370, 1000, 62, "#777260");
      rect(245, 360, 35, 125, "#777260");

      for (let y = 0; y < 840; y += 14) {
        for (let x = 469; x < 532; x += 13) {
          rect(x, y, 10, 8, "#88816a");
        }
      }

      for (let i = 0; i < 32; i++) {
        const x = 40 + hash(i, 8) * 920;
        const y = 45 + hash(i, 9) * 720;

        const closeToBuilding = maps.village.objects.some(o =>
          x > o.x - 30 &&
          x < o.x + o.w + 30 &&
          y > o.y - 40 &&
          y < o.y + o.h + 40
        );

        if (
          Math.abs(x - 500) < 210 ||
          Math.abs(y - 400) < 65 ||
          closeToBuilding
        ) {
          continue;
        }

        rect(x, y, 8, 32, "#473f30");
        rect(x - 18, y - 22, 44, 34, "#203d35");
        rect(x - 13, y - 31, 34, 30, "#2d5140");
        rect(x - 6, y - 36, 20, 22, "#426049");
      }

      for (const o of m.objects) {
        building(o);
      }

      if (state.stage === "prologue") {
        person(
          state.x + 22,
          state.y + 10,
          "mother",
          state.walk,
          "down"
        );
      } else {
        person(325, 405, "mother", 0);
        txt("MORADORA", 303, 363, "#bac2a4", 7);
      }
    } else {
      rect(0, 0, 640, 420, "#10191e");
      rect(32, 34, 576, 352, "#61503d");

      for (let y = 48; y < 375; y += 18) {
        rect(40, y, 560, 1, "#382f29");

        for (
          let x = 40 + (y % 36 ? 35 : 0);
          x < 597;
          x += 75
        ) {
          rect(x, y, 1, 18, "#3b342c");

          if (hash(x, y) > 0.4) {
            rect(x + 8, y + 5, 22, 1, "#8a70502e");
          }
        }
      }

      rect(25, 18, 590, 31, "#444846");
      rect(25, 18, 590, 5, "#757163");
      rect(25, 45, 12, 342, "#353a38");
      rect(603, 45, 12, 342, "#353a38");
      rect(25, 378, 590, 12, "#353a38");

      for (const d of m.doors) {
        if (d.y < 70 || d.y > 350) {
          rect(d.x - 19, d.y - 10, 38, 20, "#282929");
          rect(d.x - 15, d.y - 8, 30, 14, "#716049");
        } else {
          rect(d.x - 10, d.y - 22, 20, 44, "#282929");
          rect(d.x - 8, d.y - 18, 14, 36, "#716049");
        }
      }

      for (const o of m.objects) {
        furnishing(o);
      }
    }

    person(
      state.x,
      state.y,
      state.stage === "prologue" ? "father" : "player",
      state.walk,
      state.facing
    );

    c.restore();

    // Iluminação provisória por horário.
    const night =
      state.stage === "prologue" ? 0 :
      state.minutes < 360 ? 0.28 :
      state.minutes < 480 ? 0.14 :
      state.minutes > 1080 ? 0.22 :
      0.04;

    rect(0, 0, W, H, `rgba(6,16,37,${night})`);

    // Partículas ambientais.
    for (let i = 0; i < 20; i++) {
      const x = (i * 67 + elapsed * 3) % W;
      const y = (i * 43 + Math.sin(elapsed * 0.3 + i) * 15) % H;

      rect(x, y, 1, 1, "#dac89e35");
    }

    // Chuva somente no exterior.
    if (state.room === "village" && state.rain) {
      rect(0, 0, W, H, "#81959818");

      for (let i = 0; i < 90; i++) {
        let x = (i * 61 - elapsed * 35) % W;

        if (x < 0) {
          x += W;
        }

        const y = (i * 41 + elapsed * 140) % H;
        rect(x, y, 1, 5, "#a7bdc657");
      }
    }
  }

  // =========================================================
  // FUNDO PROVISÓRIO DO MENU
  // =========================================================

  function drawMenu() {
    rect(0, 0, W, H, "#343735");

    for (let y = 0; y < H; y += 15) {
      for (let x = 160; x < W; x += 25) {
        rect(
          x + (y % 30 ? 8 : 0),
          y,
          22,
          12,
          "#434740"
        );
      }
    }

    rect(163, 195, 317, 75, "#4d4033");

    for (let y = 202; y < H; y += 12) {
      rect(163, y, 317, 1, "#302e29");
    }

    const glitch = elapsed % 17 > 15.9;

    rect(393, 29, 46, 72, "#28292a");

    rect(
      397, 32, 38, 66,
      glitch ? "#090e13" : "#574438"
    );

    if (glitch) {
      rect(397, 32, 8, 66, "#594435");
    }

    for (let i = 0; i < 9; i++) {
      rect(
        345 + i * 5,
        177 - i * 9,
        100 - i * 7,
        8,
        "#77664e"
      );

      rect(
        345 + i * 5,
        184 - i * 9,
        100 - i * 7,
        2,
        "#242b2c"
      );
    }

    rect(441, 33, 4, 150, "#b19869");

    person(286, 198, "father", 0, "down", 2.4);
    person(349, 201, "mother", 0, "down", 2.4);
    person(267, 254, "player", 0, "down", 2.2);
    person(332, 251, "brother", 0, "down", 1.7);

    if (glitch) {
      c.strokeStyle = "#a13532";
      c.lineWidth = 3;

      for (const p of [[286, 137], [349, 140]]) {
        c.beginPath();

        c.moveTo(p[0] - 10, p[1] - 10);
        c.lineTo(p[0] + 10, p[1] + 10);

        c.moveTo(p[0] + 10, p[1] - 10);
        c.lineTo(p[0] - 10, p[1] + 10);

        c.stroke();

        rect(p[0] + 5, p[1] + 8, 2, 17, "#842f30");
      }

      for (let i = 0; i < 16; i++) {
        rect(165, Math.random() * H, 315, 1, "#c8c9b116");
      }
    }

    const glow = c.createRadialGradient(
      331, 78, 10,
      331, 78, 210
    );

    glow.addColorStop(0, "#e0b76b18");
    glow.addColorStop(1, "#00000090");

    c.fillStyle = glow;
    c.fillRect(160, 0, 320, H);
  }

  // =========================================================
  // DIÁLOGOS, SALVAMENTO E TRANSIÇÕES
  // =========================================================

  function say(lines, after) {
    keys.clear();

    dialog = {
      lines: lines.map(line =>
        typeof line === "string" ? ["Você", line] : line
      ),
      i: 0,
      after
    };

    $("dialog").hidden = false;
    renderDialog();
  }

  function renderDialog() {
    const line = dialog.lines[dialog.i];

    $("speaker").textContent = line[0];
    $("speech").textContent = line[1];
  }

  function advance() {
    if (!dialog) {
      return;
    }

    dialog.i++;

    if (dialog.i < dialog.lines.length) {
      renderDialog();
    } else {
      const fn = dialog.after;

      dialog = null;
      $("dialog").hidden = true;

      if (fn) {
        fn();
      }

      save();
    }
  }

  function save() {
    if (!state || transitionBusy) {
      return;
    }

    try {
      localStorage.setItem(SAVE, JSON.stringify(state));
      saveAvailable = true;
      $("continue").hidden = false;
    } catch {}
  }

  function stage(nextStage) {
    state.stage = nextStage;
    updateHud();
    save();
  }

  function go(nextRoom, x, y) {
    state.room = nextRoom;
    state.x = x;
    state.y = y;

    keys.clear();
    near = null;

    updateHud();
    save();
  }

  function fade(title, hint, fn) {
    transitionBusy = true;
    keys.clear();

    $("transitionTitle").textContent = title;
    $("transitionHint").textContent = hint;
    $("transition").classList.add("active");

    setTimeout(() => {
      fn();

      setTimeout(() => {
        $("transition").classList.remove("active");
        transitionBusy = false;
        save();
      }, 900);
    }, 700);
  }

  function enterGame() {
    mode = "game";

    $("menu").hidden = true;
    $("hud").hidden = false;
    $("overlay").hidden = true;

    updateHud();
  }

  function newGame() {
    state = initial();
    enterGame();

    say([
      [
        "Mãe",
        "A comida dele está na cozinha. Cuide do seu irmão, como sempre."
      ],
      [
        "Pai",
        "Vamos buscar mais mantimentos. Fiquem dentro de casa."
      ],
      [
        "Tutorial",
        "Agora você controla o pai. Use WASD ou as setas para caminhar. Sua esposa acompanha você. Vá ao portão norte e pressione E."
      ]
    ]);
  }

  function modal(title, text, buttons) {
    keys.clear();

    $("modalTitle").textContent = title;
    $("modalText").textContent = text;
    $("modalActions").replaceChildren();

    for (const [label, fn] of buttons) {
      const button = document.createElement("button");

      button.textContent = label;
      button.onclick = fn;

      $("modalActions").append(button);
    }

    $("overlay").hidden = false;
  }

  function closeModal() {
    $("overlay").hidden = true;
    keys.clear();
  }

  function updateHud() {
    if (!state) {
      return;
    }

    $("location").textContent = roomNames[state.room];
    $("objective").textContent = objectives[state.stage];
    $("day").textContent = state.day ? "DIA " + state.day : "PRÓLOGO";

    const hours = String(
      Math.floor(state.minutes / 60) % 24
    ).padStart(2, "0");

    const minutes = String(
      Math.floor(state.minutes) % 60
    ).padStart(2, "0");

    $("time").textContent = hours + ":" + minutes;

    $("timeNote").textContent = state.firstExit
      ? "1 HORA = 3 MINUTOS"
      : "TEMPO PARADO · INTRODUÇÃO";

    $("inventory").textContent =
      `ALIMENTO ${state.food}  ${state.key ? " · CHAVE RESERVA" : ""}`;
  }

  // =========================================================
  // MISSÕES E INTERAÇÕES
  // =========================================================

  function interact(action) {
    switch (action) {
      case "gate":
        if (state.stage === "prologue") {
          say(
            [
              ["Mãe", "Você tem certeza de que é por aqui?"],
              ["Pai", "Precisamos ir. Eles estão esperando."]
            ],
            () => fade(
              "25 horas depois",
              "15:00 · O silêncio da casa continua.",
              () => {
                state.minutes = 900;
                go("bedroom", 180, 235);
                stage("parents");
              }
            )
          );
        } else {
          say([
            "O portão está fechado. A região norte entrará em uma próxima versão."
          ]);
        }
        break;

      case "parents":
        if (state.stage === "parents") {
          say(
            [
              "A cama está arrumada. Eles parecem não ter voltado.",
              "Preciso levar a comida ao meu irmão."
            ],
            () => stage("meal")
          );
        } else if (state.stage === "check") {
          say(
            ["Ainda vazia. Não há nenhum sinal deles."],
            () => stage("empty")
          );
        } else {
          say(["Tudo ficou exatamente como estava."]);
        }
        break;

      case "food":
        if (state.stage === "meal") {
          say(
            ["É a última porção. Vou levar para ele."],
            () => {
              state.food = 1;
              stage("feed");
            }
          );
        } else if (state.stage === "empty") {
          say(
            ["Não sobrou nada. Nem no armário."],
            () => stage("talk")
          );
        } else {
          say([
            state.stage === "parents"
              ? "Primeiro preciso verificar o quarto dos meus pais."
              : "O recipiente está vazio."
          ]);
        }
        break;

      case "brother":
        if (state.stage === "feed") {
          say(
            [
              [
                "Irmão",
                "Estou com um mau pressentimento. Eles nunca demoram assim."
              ],
              [
                "Você",
                "Tenta não pensar nisso. Come um pouco e volta a dormir."
              ]
            ],
            () => {
              state.food = 0;
              stage("sleep");
            }
          );
        } else if (state.stage === "talk") {
          say(
            [
              ["Irmão", "Estou com fome de novo… Eles voltaram?"],
              ["Você", "Ainda não. Vou encontrar alguma coisa."],
              ["Irmão", "Mas a porta está trancada."],
              [
                "Você",
                "Tem uma chave reserva. Lembro de um baú no sótão."
              ]
            ],
            () => stage("key")
          );
        } else if (
          (state.stage === "return" || state.stage === "free") &&
          state.food > 0
        ) {
          say(
            [
              ["Irmão", "Você voltou! Eu ouvi alguma coisa lá embaixo."],
              ["Você", "Trouxe comida. Vou ficar aqui um pouco."]
            ],
            () => {
              state.food--;
              state.finished = true;
              stage("free");

              modal(
                "Primeira noite: abertura concluída",
                "Você completou a sequência inicial. Pode continuar explorando a casa e a vila.\n\nEsta versão ainda não inclui invasões, combate, adaptação ou o desfecho. Seu progresso fica salvo neste navegador.",
                [
                  ["Continuar explorando", closeModal]
                ]
              );
            }
          );
        } else {
          say([
            [
              "Irmão",
              state.stage === "key"
                ? "Toma cuidado no sótão."
                : "Você fica comigo um pouco?"
            ]
          ]);
        }
        break;

      case "bed":
        if (state.stage === "sleep") {
          fade(
            "9 horas depois",
            "00:00 · Faz 34 horas que eles saíram.",
            () => {
              state.minutes = 0;
              state.day = 1;
              stage("check");
            }
          );
        } else if (state.firstExit && state.minutes >= 360) {
          say(
            ["Aqui posso esperar a noite."],
            () => modal(
              "Descansar até as 18h?",
              "O tempo avança. Nesta versão inicial, não há invasões durante o descanso.",
              [
                [
                  "Descansar",
                  () => {
                    closeModal();

                    fade(
                      "Mais tarde",
                      "18:00 · A vila está escurecendo.",
                      () => {
                        state.minutes = 1080;
                        updateHud();
                      }
                    );
                  }
                ],
                ["Agora não", closeModal]
              ]
            )
          );
        } else {
          say([
            state.day
              ? "Não consigo dormir sem saber onde eles estão."
              : "Preciso cuidar do meu irmão primeiro."
          ]);
        }
        break;

      case "key":
        if (state.stage === "key") {
          say(
            [
              "Debaixo de um pano, uma chave pequena. É a da entrada."
            ],
            () => {
              state.key = true;
              stage("exit");
            }
          );
        } else {
          say([
            state.key
              ? "Só ficaram papéis e tecidos velhos."
              : "O baú está coberto de poeira."
          ]);
        }
        break;

      case "basement":
        say([
          "Trancado. A chave do porão fica com meus pais."
        ]);
        break;

      case "bath":
        say([
          "Um banheiro pequeno. Só se ouve uma torneira pingando."
        ]);
        break;

      case "photo":
        say([
          "Nós quatro, perto da escada. Não lembro quem tirou essa foto."
        ]);
        break;

      case "up":
        go("hall", 450, 200);
        break;

      case "down":
        go("foyer", 370, 255);
        break;

      case "outside":
        if (!state.key) {
          say(["A porta está trancada."]);
        } else if (!state.firstExit) {
          fade(
            "A primeira saída",
            "Observe as caixas perto da venda. E para interagir.",
            () => {
              state.firstExit = true;
              go("village", 500, 694);
              stage("supplies");
            }
          );
        } else {
          go("village", 500, 694);
        }
        break;

      case "home":
        if (state.stage === "prologue") {
          say([
            ["Pai", "Precisamos seguir para o portão norte."]
          ]);
        } else {
          go("foyer", 550, 305);
        }
        break;

      case "supply":
        if (state.stage === "prologue") {
          say([
            ["Pai", "A venda já está fechada. Vamos seguir."]
          ]);
        } else if (state.food < 2) {
          say(
            [
              "Uma cesta com pão e frutas. Há um bilhete: “Para quem precisar.”"
            ],
            () => {
              state.food++;

              if (state.stage === "supplies") {
                stage("return");
              }

              updateHud();
            }
          );
        } else {
          say(["Já tenho o que consigo carregar."]);
        }
        break;

      case "npc":
        say([
          [
            "Moradora",
            "Você não devia estar sozinho a esta hora."
          ],
          [
            "Moradora",
            "Há alimento na caixa em frente à venda, a oeste. Pegue e volte para casa."
          ]
        ]);
        break;
    }
  }

  // =========================================================
  // PROXIMIDADE E COLISÕES
  // =========================================================

  function getNear() {
    const m = maps[state.room];

    const choices = m.doors.map(d => ({
      ...d,
      dist: Math.hypot(state.x - d.x, state.y - d.y)
    }));

    for (const o of m.objects) {
      if (!o.action) {
        continue;
      }

      const px = Math.max(
        o.x,
        Math.min(state.x, o.x + o.w)
      );

      const py = Math.max(
        o.y,
        Math.min(state.y, o.y + o.h)
      );

      choices.push({
        ...o,
        dist: Math.hypot(state.x - px, state.y - py)
      });
    }

    if (
      state.room === "village" &&
      state.stage !== "prologue"
    ) {
      choices.push({
        label: "Conversar com a moradora",
        action: "npc",
        dist: Math.hypot(state.x - 325, state.y - 405)
      });
    }

    return choices
      .filter(item => item.dist < 44)
      .sort((a, b) => a.dist - b.dist)[0] || null;
  }

  function solid(x, y) {
    const m = maps[state.room];
    const pad = state.room === "village" ? 18 : 47;

    if (
      x < pad ||
      y < pad ||
      x > m.w - pad ||
      y > m.h - pad
    ) {
      return true;
    }

    return m.objects.some(o =>
      o.type !== "rug" &&
      x + 7 > o.x &&
      x - 7 < o.x + o.w &&
      y > o.y &&
      y - 6 < o.y + o.h
    );
  }

  // =========================================================
  // MOVIMENTO, TEMPO E EXPOSIÇÃO AO SOL
  // =========================================================

  function update(dt) {
    elapsed += dt;

    if (
      mode !== "game" ||
      dialog ||
      transitionBusy ||
      !$("overlay").hidden
    ) {
      return;
    }

    let dx =
      (keys.has("d") || keys.has("arrowright") ? 1 : 0) -
      (keys.has("a") || keys.has("arrowleft") ? 1 : 0);

    let dy =
      (keys.has("s") || keys.has("arrowdown") ? 1 : 0) -
      (keys.has("w") || keys.has("arrowup") ? 1 : 0);

    const speed = keys.has("shift") ? 130 : 90;
    const length = Math.hypot(dx, dy) || 1;

    dx = dx / length * speed * dt;
    dy = dy / length * speed * dt;

    if (dx || dy) {
      if (!solid(state.x + dx, state.y)) {
        state.x += dx;
      }

      if (!solid(state.x, state.y + dy)) {
        state.y += dy;
      }

      state.walk += dt * 13;

      state.facing = Math.abs(dx) > Math.abs(dy)
        ? (dx > 0 ? "right" : "left")
        : (dy > 0 ? "down" : "up");
    } else {
      state.walk = 0;
    }

    near = getNear();
    $("prompt").hidden = !near;

    if (near) {
      $("prompt").textContent = "[E] " + near.label;
    }

    if (state.firstExit) {
      const old = state.minutes;

      // 3 segundos reais = 1 minuto do jogo.
      // 3 minutos reais = 1 hora do jogo.
      state.minutes += dt / 3;

      if (state.minutes >= 1440) {
        state.minutes -= 1440;
        state.day++;
        state.rain = state.day % 3 === 0;
        save();
      }

      if (
        old < 360 &&
        state.minutes >= 360 &&
        state.room === "village"
      ) {
        say([
          "A luz… minha cabeça está girando. Preciso entrar em algum lugar."
        ]);
      }

      if (
        state.room === "village" &&
        state.minutes >= 360 &&
        state.minutes < 1080
      ) {
        state.sun = (state.sun || 0) + dt;

        if (state.sun > 18) {
          state.sun = 0;

          fade(
            "Você perdeu os sentidos",
            "Por enquanto, o protótipo retorna você à entrada de casa.",
            () => go("foyer", 530, 305)
          );
        }
      } else {
        state.sun = 0;
      }

      updateHud();

      messageTime += dt;

      if (messageTime > 10) {
        messageTime = 0;
        save();
      }
    }
  }

  function frame(time) {
    const dt = Math.min((time - last) / 1000, 0.04);
    last = time;

    update(dt);
    c.imageSmoothingEnabled = false;

    if (mode === "menu") {
      drawMenu();
    } else if (state) {
      drawWorld();
    }

    if (state && mode === "game" && state.sun) {
      rect(
        0,
        0,
        W,
        H,
        `rgba(189,153,117,${Math.min(0.5, state.sun / 36)})`
      );
    }

    requestAnimationFrame(frame);
  }

  // =========================================================
  // TECLADO E PAUSA
  // =========================================================

  window.addEventListener("keydown", event => {
    const key = event.key.toLowerCase();

    if (
      [
        "arrowup",
        "arrowdown",
        "arrowleft",
        "arrowright",
        " ",
        "escape"
      ].includes(key)
    ) {
      event.preventDefault();
    }

    if (
      event.repeat &&
      ["e", "escape", "enter"].includes(key)
    ) {
      return;
    }

    if (
      key === "escape" &&
      mode === "game" &&
      !transitionBusy
    ) {
      if (!$("overlay").hidden) {
        closeModal();
        return;
      }

      if (dialog) {
        return;
      }

      modal(
        "Pausado",
        "O tempo está parado. Seu progresso é salvo automaticamente neste navegador.",
        [
          ["Voltar", closeModal],
          [
            "Menu principal",
            () => {
              save();
              closeModal();

              mode = "menu";

              $("menu").hidden = false;
              $("hud").hidden = true;
              $("prompt").hidden = true;
            }
          ]
        ]
      );

      return;
    }

    if (!$("overlay").hidden || transitionBusy) {
      return;
    }

    if (key === "e" && mode === "game") {
      if (dialog) {
        advance();
      } else {
        const target = getNear();

        if (target) {
          if (target.action) {
            interact(target.action);
          } else if (target.to) {
            go(target.to, target.tx, target.ty);
          }
        }
      }

      return;
    }

    if (!dialog) {
      keys.add(key);
    }
  });

  window.addEventListener("keyup", event => {
    keys.delete(event.key.toLowerCase());
  });

  window.addEventListener("blur", () => {
    keys.clear();

    if (
      mode === "game" &&
      !dialog &&
      !transitionBusy &&
      $("overlay").hidden
    ) {
      modal(
        "Pausado",
        "A janela perdeu o foco. O tempo está parado.",
        [["Voltar", closeModal]]
      );
    }
  });

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      keys.clear();
      save();

      if (mode === "game" && $("overlay").hidden) {
        modal(
          "Pausado",
          "O jogo foi pausado ao trocar de aba.",
          [["Voltar", closeModal]]
        );
      }
    }
  });

  // =========================================================
  // BOTÕES DO MENU
  // =========================================================

  $("next").onclick = advance;

  $("play").onclick = () => {
    if (saveAvailable) {
      modal(
        "Começar novamente?",
        "Isso substitui o progresso salvo neste navegador.",
        [
          [
            "Novo jogo",
            () => {
              closeModal();
              newGame();
            }
          ],
          ["Cancelar", closeModal]
        ]
      );
    } else {
      newGame();
    }
  };

  $("continue").onclick = () => {
    try {
      const saved = JSON.parse(localStorage.getItem(SAVE));

      if (
        saved.schema !== 1 ||
        !maps[saved.room] ||
        !objectives[saved.stage] ||
        !Number.isFinite(saved.x) ||
        !Number.isFinite(saved.y) ||
        !Number.isFinite(saved.minutes)
      ) {
        throw new Error("Progresso incompatível.");
      }

      state = saved;
      enterGame();
    } catch {
      modal(
        "Não foi possível abrir o progresso",
        "Você pode começar um novo jogo.",
        [
          [
            "Novo jogo",
            () => {
              closeModal();
              newGame();
            }
          ],
          ["Voltar", closeModal]
        ]
      );
    }
  };

  $("help").onclick = () => modal(
    "Como jogar",
    "WASD ou setas — caminhar\nShift — correr\nE — examinar, conversar e avançar diálogos\nEsc — pausar\n\nAproxime-se de portas e objetos até aparecer a indicação de interação. As portas só abrem ao pressionar E.\n\nO relógio começa na primeira saída. Uma hora leva três minutos reais. Ao amanhecer, procure abrigo.\n\nEsta é a abertura jogável: da saída dos pais à primeira busca de alimento. Combate e invasões serão adicionados depois.",
    [["Voltar", closeModal]]
  );

  $("credits").onclick = () => modal(
    "Créditos",
    "A QUINTA SOMBRA\nConceito, história e desenhos de referência: criador do projeto.\nProgramação e arte provisória em Canvas: desenvolvidas com assistência do ChatGPT.\n\nSem imagens, fontes ou bibliotecas externas. Retrato, personagens e cenários ainda serão refinados juntos.\nVersão 0.1.0 — protótipo da abertura.",
    [["Voltar", closeModal]]
  );

  requestAnimationFrame(frame);
})();
