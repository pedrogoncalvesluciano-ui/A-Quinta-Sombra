/*CODIGO JAVA SCRIPT*/
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

  // Bloqueia cliques e atalhos apenas durante a apresentação do logotipo.
  let bootBusy = Boolean($("bootSplash"));
  if (bootBusy) $("game").inert = true;
  window.addEventListener("keydown", event => {
    if (!bootBusy) return;
    event.preventDefault();
    event.stopImmediatePropagation();
  }, true);

  function waitForBootImage(image, timeout = 10000) {
    if (!image || image.complete) return Promise.resolve(Boolean(image?.naturalWidth));
    return new Promise(resolve => {
      let timer;
      const finish = () => {
        clearTimeout(timer);
        image.removeEventListener("load", finish);
        image.removeEventListener("error", finish);
        resolve(Boolean(image.complete && image.naturalWidth));
      };
      image.addEventListener("load", finish, { once: true });
      image.addEventListener("error", finish, { once: true });
      timer = setTimeout(finish, timeout);
    });
  }

  async function showBootSplash() {
    const splash = $("bootSplash");

    if (!splash) {
      bootBusy = false;
      $("game").inert = false;
      return;
    }

    const logo = $("bootLogo");
    const status = $("bootStatus");

    const pause = ms =>
      new Promise(resolve => setTimeout(resolve, ms));

    const releaseBoot = () => {
      splash.hidden = true;
      $("game").inert = false;
      bootBusy = false;
      keys.clear();
    };

    // Segurança: nenhuma imagem pode prender o jogo indefinidamente.
    const hardTimeout = setTimeout(() => {
      console.warn("A abertura excedeu o tempo limite. Abrindo o menu.");
      releaseBoot();
    }, 12000);

    const fadeOpacity = async (element, from, to, ms) => {
      if (!element || splash.hidden) return;

      try {
        await element.animate(
          [
            { opacity: from },
            { opacity: to }
          ],
          {
            duration: ms,
            easing: "ease-in-out",
            fill: "forwards"
          }
        ).finished;
      } catch {}

      if (element) {
        element.style.opacity = String(to);
      }
    };

    try {
      // Sprites de personagens e do quarto carregam em segundo plano.
      // A tela inicial NÃO espera mais por eles.
      const logoReady = await waitForBootImage(
        logo,
        5000
      );

      if (!logoReady) {
        if (logo) {
          logo.hidden = true;
        }

        if (status) {
          status.textContent = "Abrindo o menu…";
        }

        await pause(450);
        return;
      }

      if (typeof logo.decode === "function") {
        await Promise.race([
          logo.decode().catch(() => {}),
          pause(1200)
        ]);
      }

      if (status) {
        status.hidden = true;
      }

      // Logo visível por alguns segundos, sem bloquear por assets grandes.
      await fadeOpacity(
        logo,
        0,
        1,
        1800
      );

      await pause(1800);

      await fadeOpacity(
        logo,
        1,
        0,
        900
      );

      await fadeOpacity(
        splash,
        1,
        0,
        500
      );
    } catch (error) {
      console.warn(
        "Não foi possível concluir a abertura do logo.",
        error
      );
    } finally {
      clearTimeout(hardTimeout);
      releaseBoot();
    }
  }

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
    prologue: "Vá com sua esposa até o mercado da cidade.",
    parents: "Verifique o quarto dos seus pais.",
    meal: "Pegue a comida na cozinha.",
    feed: "Leve a comida ao seu irmão.",
    sleep: "Volte ao seu quarto e tente dormir.",
    check: "Procure seus pais novamente.",
    empty: "Verifique a comida na cozinha.",
    talk: "Converse com seu irmão.",
    key: "Procure a chave reserva no sótão.",
    exit: "Abra a porta de entrada.",
    supplies: "Peça ajuda à vizinha para alimentar seu irmão.",
    return: "Leve o alimento para seu irmão.",
    free: "Explore o bairro e procure pistas sobre seus pais."
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
    village: "Bairro residencial · interior da Alemanha"
  };

  function initial() {
    return {
      schema: 1,
      room: "foyer",
      x: housePoint(220),
      y: housePoint(315),
      houseLayout: 1,
      familyFarewell: false,
      stage: "prologue",
      minutes: 14 * 60,
      day: 0,
      food: 0,
      key: false,
      firstExit: false,
      finished: false,
      rain: false,
      playerLampOn: false,
      facing: "down",
      walk: 0
    };
  }

  // =========================================================
  // MAPAS E OBJETOS
  // =========================================================

  const maps = {};
  // Coordenadas legadas continuam sendo usadas nas ligações entre cômodos.
  // O mapa interno ocupa 80% da largura e altura, sem encolher personagens.
  const HOUSE_SCALE = 0.8;
  const housePoint = value => value * HOUSE_SCALE;
  const children = { x: housePoint(330), y: housePoint(195) };
  let openingStaticUntil = 0;

  function migrateHouseSave(saved) {
    if (!saved || saved.houseLayout === 1) return;
    if (saved.room !== "village") {
      saved.x = housePoint(saved.x);
      saved.y = housePoint(saved.y);
    }
    const enemy = saved.danger?.enemy;
    if (enemy && enemy.room !== "village") {
      enemy.x = housePoint(enemy.x);
      enemy.y = housePoint(enemy.y);
      enemy.path = enemy.path.map(point => point.map(housePoint));
    }
    if (saved.stage === "prologue") saved.familyFarewell = true;
    delete saved.mother;
    saved.houseLayout = 1;
    migrateHouseSave(saved.rescueCheckpoint);
  }

  function room(id, objects, doors) {
    maps[id] = {
      w: housePoint(640),
      h: housePoint(420),
      objects: objects.map(o => ({ ...o,
        x: housePoint(o.x), y: housePoint(o.y),
        w: housePoint(o.w), h: housePoint(o.h)
      })),
      doors: doors.map(d => ({ ...d,
        x: housePoint(d.x), y: housePoint(d.y)
      }))
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
      // Hitbox da parede superior, deixando o vão da porta livre.
      obj(0, 0, 58, 92, "playerBlock"),
      obj(145, 0, 495, 92, "playerBlock"),

      // Hitbox das paredes laterais.
      obj(0, 0, 34, 420, "playerBlock"),
      obj(607, 0, 33, 420, "playerBlock"),

      // Cama — permanece no mesmo lugar.
      // A hitbox é menor que o desenho para a colisão ficar natural.
      obj(
        255, 92, 82, 118,
        "playerBed",
        "Cama",
        "bed"
      ),

      // Abajur / criado-mudo.
      obj(
        372, 94, 48, 50,
        "playerNightstand",
        "Luminária",
        "togglePlayerLamp"
      ),

      // Estante ao lado do abajur.
      obj(
        438, 92, 78, 44,
        "playerShelf"
      ),

      // Escrivaninha na parede direita.
      // Hitbox estreita: acompanha somente a parte física do móvel.
      obj(
        548, 96, 28, 176,
        "playerDesk"
      ),

      // Bagunça com colisões pequenas e próprias.
      obj(132, 303, 55, 34, "playerClutterBlock"),
      obj(211, 322, 36, 22, "playerClutterBlock"),
      obj(271, 329, 31, 19, "playerClutterBlock")
    ],
    [
      door(131, 46, "hall", 490, 325, "Sair do quarto")
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
      door(490, 374, "bedroom", 131, 132, "Seu quarto"),
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
    w: 1280,
    h: 1040,

    objects: [
      // Quadra da família: casa, quintal e entrada externa do porão.
      obj(325, 570, 235, 155, "house"),
      obj(
        350, 505, 72, 44,
        "yardBasement",
        "Examinar a entrada do porão",
        "yardBasement"
      ),

      // Casa da vizinha: primeira fonte de alimento.
      obj(
        85, 555, 190, 145,
        "neighborHouse",
        "Bater na casa da vizinha",
        "neighborDoor"
      ),

      // Mercado: algumas quadras acima da casa.
      obj(
        735, 70, 205, 150,
        "market",
        "Examinar o mercado",
        "marketDoor"
      ),

      // Casas residenciais provisórias.
      obj(80, 115, 180, 135, "building"),
      obj(300, 115, 165, 135, "building"),
      obj(790, 300, 180, 135, "building"),
      obj(1015, 295, 175, 140, "building"),
      obj(75, 300, 170, 130, "building"),
      obj(290, 300, 165, 130, "building"),
      obj(795, 555, 175, 145, "building"),
      obj(
        1010, 560, 175, 140,
        "policeStation",
        "Entrar na delegacia",
        "policeDoor"
      ),
      obj(120, 845, 180, 135, "building"),
      obj(835, 845, 190, 135, "building"),

      // Rotas laterais bloqueadas por recursos diferentes.
      obj(5, 407, 80, 52, "gate", "Passagem oeste bloqueada", "westBarrier"),
      obj(1195, 407, 80, 52, "gate", "Passagem leste escura", "eastBarrier")
    ],

    doors: [
      door(442, 742, null, 0, 0, "Entrar em casa", "home")
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

// Sprites LPC dos quatro integrantes da família.
// Todos usam frames de 64x64 e a mesma ordem de direção:
// cima, esquerda, baixo, direita.
const CHARACTER_FRAME_SIZE = 64;

const CHARACTER_ROWS = {
  up: 0,
  left: 1,
  down: 2,
  right: 3
};

// A diferença de idade é feita pela escala final.
// Pai e mãe: mesmo tamanho.
// Player: adolescente de 14 anos, um pouco menor.
// Irmão: criança de 8 anos, menor que o player.
const CHARACTER_BASE_SCALE = {
  father: 0.98,
  mother: 0.98,
  player: 0.89,
  brother: 0.75
};

const characterSpriteSheets = {
  father: {},
  mother: {},
  player: {},
  brother: {}
};

for (const kind of Object.keys(characterSpriteSheets)) {
  const animations =
    kind === "player"
      ? ["idle", "walk", "thrust"]
      : ["idle", "walk"];

  for (const animation of animations) {
    const image = new Image();

    image.src =
      `assets/sprites/characters/${kind}/${animation}.png`;

    characterSpriteSheets[kind][animation] = image;
  }
}

const playerRoomSpriteNames = {
  floor: "chao-player.png",
  walls: "paredes-player.png",
  bed: "cama-player.png",
  shelf: "estante-player.png",
  desk: "escrivaninha-player.png",
  nightstand: "criado-mudo-player.png",
  lampOff: "luminaria-player-off.png",
  lampOn: "luminaria-player-on.png",
  rug: "tapete-player.png",
  backpack: "mochila-player.png",
  clothes: "roupas-player.png",
  shoes: "tenis-player.png",
  flipflops: "chinelo-player.png",
  trash: "lixeira-player.png",
  poster1: "cartaz-escola-player-01.png",
  poster2: "cartaz-escola-player-02.png",
  poster3: "cartaz-escola-player-03.png"
};

const playerRoomSprites = {};

for (const [key, filename] of Object.entries(playerRoomSpriteNames)) {
  const image = new Image();
  image.src =
    `assets/sprites/house/player-room/${filename}?v=0.6.7`;
  playerRoomSprites[key] = image;
}

function spriteReady(image) {
  return Boolean(
    image &&
    image.complete &&
    image.naturalWidth > 0 &&
    image.naturalHeight > 0
  );
}

function drawSprite(image, x, y, w, h) {
  if (!spriteReady(image)) return false;

  c.save();

  // Os assets da casa são PNGs grandes. Nearest-neighbor ao reduzi-los
  // destruía detalhes e fazia os móveis parecerem "quadriculados".
  c.imageSmoothingEnabled = true;

  if ("imageSmoothingQuality" in c) {
    c.imageSmoothingQuality = "high";
  }

  c.drawImage(
    image,
    Math.round(x),
    Math.round(y),
    Math.round(w),
    Math.round(h)
  );

  c.restore();
  return true;
}

// Recorta automaticamente as margens transparentes dos PNGs.
// Isso evita que cama, estante e mesa fiquem achatadas por causa
// do tamanho do canvas original da imagem.
const spriteCropCache = new WeakMap();

function getSpriteCrop(image) {
  if (spriteCropCache.has(image)) {
    return spriteCropCache.get(image);
  }

  const full = {
    x: 0,
    y: 0,
    w: image.naturalWidth,
    h: image.naturalHeight
  };

  try {
    const maxSample = 2048;
    const scale = Math.min(
      1,
      maxSample / image.naturalWidth,
      maxSample / image.naturalHeight
    );

    const sw = Math.max(
      1,
      Math.round(image.naturalWidth * scale)
    );

    const sh = Math.max(
      1,
      Math.round(image.naturalHeight * scale)
    );

    const sample = document.createElement("canvas");
    sample.width = sw;
    sample.height = sh;

    const sc = sample.getContext("2d", {
      willReadFrequently: true
    });

    sc.clearRect(0, 0, sw, sh);
    sc.drawImage(image, 0, 0, sw, sh);

    const data = sc.getImageData(
      0,
      0,
      sw,
      sh
    ).data;

    let minX = sw;
    let minY = sh;
    let maxX = -1;
    let maxY = -1;

    for (let yy = 0; yy < sh; yy++) {
      for (let xx = 0; xx < sw; xx++) {
        const alpha =
          data[(yy * sw + xx) * 4 + 3];

        if (alpha <= 10) continue;

        if (xx < minX) minX = xx;
        if (xx > maxX) maxX = xx;
        if (yy < minY) minY = yy;
        if (yy > maxY) maxY = yy;
      }
    }

    if (maxX < minX || maxY < minY) {
      spriteCropCache.set(image, full);
      return full;
    }

    const pad = 2;

    minX = Math.max(0, minX - pad);
    minY = Math.max(0, minY - pad);
    maxX = Math.min(sw - 1, maxX + pad);
    maxY = Math.min(sh - 1, maxY + pad);

    const crop = {
      x: Math.floor(minX / scale),
      y: Math.floor(minY / scale),
      w: Math.min(
        image.naturalWidth,
        Math.ceil((maxX - minX + 1) / scale)
      ),
      h: Math.min(
        image.naturalHeight,
        Math.ceil((maxY - minY + 1) / scale)
      )
    };

    spriteCropCache.set(image, crop);
    return crop;
  } catch (error) {
    console.warn(
      "Não foi possível recortar o sprite.",
      error
    );

    spriteCropCache.set(image, full);
    return full;
  }
}

// Desenha usando somente a área real do objeto e mantém a proporção.
function drawSpriteContain(image, x, y, w, h) {
  if (!spriteReady(image)) return false;

  const crop = getSpriteCrop(image);
  const ratio = crop.w / crop.h;

  let dw = w;
  let dh = dw / ratio;

  if (dh > h) {
    dh = h;
    dw = dh * ratio;
  }

  const dx = x + (w - dw) / 2;
  const dy = y + (h - dh) / 2;

  c.save();
  c.imageSmoothingEnabled = true;

  if ("imageSmoothingQuality" in c) {
    c.imageSmoothingQuality = "high";
  }

  c.drawImage(
    image,
    crop.x,
    crop.y,
    crop.w,
    crop.h,
    Math.round(dx),
    Math.round(dy),
    dw,
    dh
  );

  c.restore();
  return true;
}

// Para pisos: remove a margem transparente do PNG e estica o conteúdo
// exatamente até o contorno interno do cômodo.
function drawSpriteCropStretch(image, x, y, w, h) {
  if (!spriteReady(image)) return false;

  const crop = getSpriteCrop(image);

  c.save();
  c.imageSmoothingEnabled = true;

  if ("imageSmoothingQuality" in c) {
    c.imageSmoothingQuality = "high";
  }

  c.drawImage(
    image,
    crop.x,
    crop.y,
    crop.w,
    crop.h,
    Math.round(x),
    Math.round(y),
    Math.round(w),
    Math.round(h)
  );

  c.restore();
  return true;
}

function drawPlayerRoomBackground(m) {
  // Base escura atrás das paredes.
  rect(0, 0, m.w, m.h, "#241f1b");

  // O piso entra 2 unidades sob as paredes. A parede é desenhada depois,
  // então esse pequeno sangramento elimina frestas sem aparecer.
  const floorX = housePoint(58);
  const floorY = housePoint(76);
  const floorW = housePoint(524);
  const floorH = housePoint(282);

  if (
    !drawSpriteCropStretch(
      playerRoomSprites.floor,
      floorX,
      floorY,
      floorW,
      floorH
    )
  ) {
    rect(
      floorX,
      floorY,
      floorW,
      floorH,
      "#61503d"
    );
  }

  // Parede de fundo.
  drawSprite(
    playerRoomSprites.walls,
    0,
    0,
    m.w,
    m.h
  );

  // Pôsteres retirados temporariamente.
}

// A faixa inferior é redesenhada DEPOIS do personagem.
// Assim o player pode andar nessa área e parecer passar atrás/por baixo
// da parede, em vez de ficar bloqueado ou desenhado sobre ela.
function drawPlayerRoomForeground(m) {
  if (!spriteReady(playerRoomSprites.walls)) return;

  const foregroundY = housePoint(316);

  c.save();
  c.beginPath();
  c.rect(
    0,
    foregroundY,
    m.w,
    m.h - foregroundY
  );
  c.clip();

  drawSprite(
    playerRoomSprites.walls,
    0,
    0,
    m.w,
    m.h
  );

  c.restore();
}

function drawPlayerRoomClutter() {
  for (const key of ["backpack", "flipflops", "trash", "shoes", "clothes"]) {
    drawRoomItem(key);
  }
}

function drawCharacterSprite(
  x,
  y,
  kind = "player",
  walk = 0,
  face = "down",
  scale = 1
) {
  const sheets = characterSpriteSheets[kind];

  if (!sheets) return false;

  const moving = Math.abs(walk) > 0.01;

  const punching =
    kind === "player" &&
    state &&
    state.danger &&
    state.danger.punch > 0 &&
    sheets.thrust;

  let animation = "idle";
  let frame = 0;

  if (punching) {
    animation = "thrust";

    // O golpe dura 0,45 s no sistema atual.
    // thrust possui 8 quadros válidos: 0..7.
    const progress = Math.max(
      0,
      Math.min(
        0.999,
        1 - state.danger.punch / 0.45
      )
    );

    frame = Math.floor(progress * 8);
  } else if (moving) {
    animation = "walk";

    // LPC walk: quadro 0 é a pose parada.
    // A caminhada real usa 1..8.
    const walkFrames = [
      1, 2, 3, 4,
      5, 6, 7, 8
    ];

    frame =
      walkFrames[
        Math.floor(Math.abs(walk)) %
        walkFrames.length
      ];
  } else {
    animation = "idle";

    // LPC idle possui apenas 2 quadros.
    // O ciclo recomendado segura mais tempo o primeiro:
    // 0 → 0 → 1.
    const idleFrames = [0, 0, 1];

    frame =
      idleFrames[
        Math.floor(elapsed / 0.75) %
        idleFrames.length
      ];
  }

  const image = sheets[animation];

  if (
    !image ||
    !image.complete ||
    image.naturalWidth <= 0 ||
    image.naturalHeight <= 0
  ) {
    return false;
  }

  const rows = Math.max(
    1,
    Math.floor(
      image.naturalHeight / CHARACTER_FRAME_SIZE
    )
  );

  const row = Math.min(
    CHARACTER_ROWS[face] ?? CHARACTER_ROWS.down,
    rows - 1
  );

  const spriteScale =
    CHARACTER_BASE_SCALE[kind] * scale;

  const size =
    CHARACTER_FRAME_SIZE * spriteScale;

  c.save();
  c.imageSmoothingEnabled = false;

  c.drawImage(
    image,
    frame * CHARACTER_FRAME_SIZE,
    row * CHARACTER_FRAME_SIZE,
    CHARACTER_FRAME_SIZE,
    CHARACTER_FRAME_SIZE,
    Math.round(x - size / 2),
    Math.round(y - size),
    Math.round(size),
    Math.round(size)
  );

  c.restore();

  return true;
}

  function person(
    x,
    y,
    kind = "player",
    walk = 0,
    face = "down",
    scale = 1
  ) {
    if (
      drawCharacterSprite(
        x,
        y,
        kind,
        walk,
        face,
        scale
      )
    ) {
      return;
    }

    // Fallback provisório caso alguma imagem ainda não tenha
    // terminado de carregar ou algum arquivo esteja ausente.
    c.save();
    c.translate(Math.round(x), Math.round(y));

    const fallbackScale =
      (CHARACTER_BASE_SCALE[kind] || 0.74) /
      CHARACTER_BASE_SCALE.player *
      scale;

    c.scale(fallbackScale, fallbackScale);

    const skin =
      kind === "mother" || kind === "npcFemale"
        ? "#c6967b"
        : "#bc9071";

    const shirt = {
      player: "#587a78",
      father: "#665d49",
      mother: "#8e5960",
      brother: "#a58757",
      npcMale: "#53585a",
      npcFemale: "#6a5966"
    }[kind] || "#587a78";

    const leg = Math.sin(walk) * 2;

    rect(-7, 0, 14, 3, "#080d1290");

    rect(-4, -10, 4, 10 + leg, "#29303d");
    rect(1, -10, 4, 10 - leg, "#29303d");

    rect(-6, -20, 12, 13, shirt);

    rect(-9, -19, 3, 10, skin);
    rect(6, -19, 3, 10, skin);

    rect(-5, -30, 10, 11, skin);
    rect(-6, -32, 12, 5, "#392c2a");

    if (kind === "mother" || kind === "npcFemale") {
      rect(-7, -29, 3, 13, "#392c2a");
      rect(5, -29, 3, 13, "#392c2a");
    }

    if (face !== "up") {
      rect(
        face === "left" ? -5 : -2,
        -25,
        2,
        2,
        "#1a232a"
      );

      if (face === "down") {
        rect(3, -25, 2, 2, "#1a232a");
      }
    }

    c.restore();
  }

  // =========================================================
  // MÓVEIS
  // =========================================================

  function furnishing(o) {
    const { x, y, w, h, type } = o;

        // Hitbox invisível das paredes.
    if (
      type === "playerBlock" ||
      type === "playerClutterBlock"
    ) {
      return;
    }

    const item = {playerBed:"bed", playerShelf:"shelf", playerDesk:"desk", playerNightstand:"nightstand"}[type];
    if (item) {
      drawRoomItem(item);
      if (item === "nightstand") drawRoomItem(state?.playerLampOn ? "lampOn" : "lampOff");
      return;
    }

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

      if (type === "brotherbed" && state.stage !== "prologue") {
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
      rect(x, y, 12, Math.max(46, h), "#484d48");
      rect(x + w - 12, y, 12, Math.max(46, h), "#484d48");

      for (let i = 20; i < w; i += 15) {
        rect(x + i, y + 12, 4, Math.max(30, h - 12), "#545650");
      }

      return;
    }

    if (type === "yardBasement") {
      rect(x + 5, y + 8, w - 10, h - 8, "#171a19");
      rect(x, y + 14, w, h - 14, "#3f443e");
      rect(x + 6, y + 20, w - 12, h - 24, "#252925");
      rect(x + 11, y + 23, w - 22, 4, "#716049");
      rect(x + w - 17, y + 29, 5, 8, "#a88d5d");
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

    if (type === "market") {
      rect(x + 20, y + 48, w - 40, 16, "#282f30");
      txt("MARKT", x + 73, y + 60, "#d0ba85", 10);
      rect(x + w / 2 - 30, y + h + 2, 60, 22, "#85684a");
    }

    if (type === "neighborHouse") {
      rect(x + 19, y + 49, w - 38, 11, "#42372f");
      txt("Nº 8", x + w / 2 - 11, y + h - 55, "#bda77d", 7);
    }

    if (type === "policeStation") {
      rect(x + 22, y + 48, w - 44, 17, "#26323a");
      txt("POLIZEI", x + 59, y + 60, "#d1c9ad", 9);
      rect(x + w / 2 - 24, y + h + 2, 48, 18, "#555d5b");
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

      // Rua principal vertical: casa -> mercado -> saída norte.
      rect(610, 0, 78, 1040, "#706b5f");

      // Cruzamento superior.
      rect(0, 385, 1280, 78, "#706b5f");

      // Rua inferior: livre desde a primeira saída.
      rect(0, 755, 1280, 82, "#706b5f");

      // Entrada curta da casa da família até a rua principal.
      rect(420, 710, 190, 45, "#706b5f");

      for (let y = 0; y < 1040; y += 16) {
        for (let x = 614; x < 686; x += 14) {
          rect(x, y, 10, 9, "#858071");
        }
      }

      for (const roadY of [390, 760]) {
        for (let x = 0; x < 1280; x += 16) {
          rect(x, roadY + 8, 11, 8, "#858071");
          rect(x + 7, roadY + 28, 11, 8, "#7b7669");
          rect(x, roadY + 50, 11, 8, "#858071");
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
          Math.abs(x - 650) < 92 ||
          Math.abs(y - 424) < 72 ||
          Math.abs(y - 796) < 76 ||
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
               drawMother();
      } else {
        person(292, 692, "npcFemale", 0);
        txt("VIZINHA", 274, 650, "#bac2a4", 7);
      }
    } else {
      if (state.room === "bedroom") {
        drawPlayerRoomBackground(m);
      } else {
        c.save();
        c.scale(HOUSE_SCALE, HOUSE_SCALE);
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
        c.restore();
      }

      for (const d of m.doors) {
        // O quarto possui a abertura desenhada no próprio sprite de parede.
        // Não sobrepõe a porta genérica do Canvas nessa cena.
        if (state.room === "bedroom") continue;

        if (d.y < housePoint(70) || d.y > housePoint(350)) {
          rect(d.x - 19, d.y - 10, 38, 20, "#282929");
          rect(d.x - 15, d.y - 8, 30, 14, "#716049");
        } else {
          rect(d.x - 10, d.y - 22, 20, 44, "#282929");
          rect(d.x - 8, d.y - 18, 14, 36, "#716049");
        }
      }

      if (state.room === "bedroom") {
        // O tapete é a primeira camada decorativa:
        // cama e demais móveis ficam desenhados por cima.
        drawRoomItem("rug");
      }

      for (const o of m.objects) {
        furnishing(o);
      }

      if (state.room === "bedroom") {
        drawPlayerRoomClutter();
      }
    }

    if (state.stage === "prologue" && state.room !== "village") {
      drawMother();
      if (state.room === "foyer") {
        person(children.x - 18, children.y, "player", 0, "down");
        person(children.x + 18, children.y + 5, "brother", 0, "down", 0.8);
      }
    }

    person(
      state.x,
      state.y,
      state.stage === "prologue" ? "father" : "player",
      state.walk,
      state.facing
    );

    if (state.room === "bedroom") {
      drawPlayerRoomForeground(m);
    }

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

      drawStatic(165, 315);
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

  // Mãe acompanhante: segue o percurso do pai com distância.

  function prepareMother() {
    if (
      state.mother &&
      Number.isFinite(state.mother.x) &&
      Number.isFinite(state.mother.y)
    ) {
      const mother = state.mother;

      // Converte automaticamente saves do sistema antigo de trilha.
      if (!Number.isFinite(mother.think)) {
        mother.think = 0;
      }

      if (!Number.isFinite(mother.targetX)) {
        mother.targetX = mother.x;
      }

      if (!Number.isFinite(mother.targetY)) {
        mother.targetY = mother.y;
      }

      if (!Number.isFinite(mother.preferredSide)) {
        mother.preferredSide = 1;
      }

      if (!Number.isFinite(mother.pause)) {
        mother.pause = 0;
      }

      if (!Number.isFinite(mother.lastFatherX)) {
        mother.lastFatherX = state.x;
      }

      if (!Number.isFinite(mother.lastFatherY)) {
        mother.lastFatherY = state.y;
      }

      // Dados da IA anterior não são mais necessários.
      delete mother.trail;
      delete mother.lastX;
      delete mother.lastY;

      return;
    }

    const start = {
      x: state.x,
      y: state.y
    };

    // Tenta nascer perto do pai, mas não exatamente atrás dele.
    const positions = [
      [38, 46],
      [-38, 46],
      [48, 0],
      [-48, 0],
      [0, 52]
    ];

    for (const [dx, dy] of positions) {
      const x = state.x + dx;
      const y = state.y + dy;

      if (!solid(x, y)) {
        start.x = x;
        start.y = y;
        break;
      }
    }

    state.mother = {
      x: start.x,
      y: start.y,
      walk: 0,
      facing: "up",

      // "Cérebro" próprio.
      think: 0,
      targetX: start.x,
      targetY: start.y,
      preferredSide: 1,
      pause: 0,
      lastFatherX: state.x,
      lastFatherY: state.y
    };
  }

  function drawMother() {
    prepareMother();

    const mother = state.mother;

    person(
      mother.x,
      mother.y,
      "mother",
      mother.walk,
      mother.facing
    );
  }

  function motherDesiredOffset() {
    const mother = state.mother;

    const behind = {
      up: [0, 1],
      down: [0, -1],
      left: [1, 0],
      right: [-1, 0]
    }[state.facing] || [0, 1];

    const side = {
      up: [1, 0],
      down: [-1, 0],
      left: [0, -1],
      right: [0, 1]
    }[state.facing] || [1, 0];

    // Ela anda atrás, mas levemente de lado, como outra pessoa.
    const backDistance = 45;
    const sideDistance = 20 * mother.preferredSide;

    return {
      x:
        state.x +
        behind[0] * backDistance +
        side[0] * sideDistance,

      y:
        state.y +
        behind[1] * backDistance +
        side[1] * sideDistance
    };
  }

  function motherChooseTarget() {
    const mother = state.mother;
    const desired = motherDesiredOffset();

    // Se o ponto ideal estiver livre, ela segue para ele.
    if (!solid(desired.x, desired.y)) {
      mother.targetX = desired.x;
      mother.targetY = desired.y;
      return;
    }

    // Caso contrário, procura uma alternativa própria ao redor do pai.
    const options = [
      [52, 0],
      [-52, 0],
      [0, 52],
      [0, -52],
      [38, 38],
      [-38, 38],
      [38, -38],
      [-38, -38]
    ];

    let best = null;
    let bestScore = Infinity;

    for (const [dx, dy] of options) {
      const x = state.x + dx;
      const y = state.y + dy;

      if (solid(x, y)) continue;

      const fromMother = Math.hypot(
        x - mother.x,
        y - mother.y
      );

      const fromDesired = Math.hypot(
        x - desired.x,
        y - desired.y
      );

      const score =
        fromMother +
        fromDesired * 0.65;

      if (score < bestScore) {
        bestScore = score;
        best = { x, y };
      }
    }

    if (best) {
      mother.targetX = best.x;
      mother.targetY = best.y;
    } else {
      mother.targetX = state.x;
      mother.targetY = state.y;
    }
  }

  function motherTryMove(dx, dy) {
    const mother = state.mother;

    const nx = mother.x + dx;
    const ny = mother.y + dy;

    if (!solid(nx, ny)) {
      mother.x = nx;
      mother.y = ny;
      return true;
    }

    return false;
  }

  function updateMother(dt) {
    if (state.stage !== "prologue") {
      return;
    }

    prepareMother();

    const mother = state.mother;

    mother.think -= dt;
    mother.pause = Math.max(
      0,
      mother.pause - dt
    );

    const fatherMoved =
      Math.hypot(
        state.x - mother.lastFatherX,
        state.y - mother.lastFatherY
      ) > 6;

    // A mãe não recalcula a cada pixel.
    // Ela "pensa" em pequenos intervalos e escolhe outro ponto.
    if (mother.think <= 0 || fatherMoved) {
      mother.think =
        0.45 +
        hash(
          Math.floor(elapsed * 10),
          Math.floor(mother.x + mother.y)
        ) * 0.55;

      mother.lastFatherX = state.x;
      mother.lastFatherY = state.y;

      // Às vezes troca o lado por onde prefere acompanhar.
      if (
        hash(
          Math.floor(elapsed * 3),
          Math.floor(state.x + state.y)
        ) > 0.72
      ) {
        mother.preferredSide *= -1;
      }

      motherChooseTarget();
    }

    const distanceToFather = Math.hypot(
      state.x - mother.x,
      state.y - mother.y
    );

    const dx =
      mother.targetX - mother.x;

    const dy =
      mother.targetY - mother.y;

    const distanceToTarget =
      Math.hypot(dx, dy);

    // Se já está perto, ela não fica grudada nem tremendo.
    if (
      distanceToFather >= 38 &&
      distanceToFather <= 68 &&
      distanceToTarget < 12
    ) {
      mother.walk = 0;

      if (mother.pause <= 0) {
        mother.pause =
          0.15 +
          hash(
            Math.floor(mother.x),
            Math.floor(elapsed * 7)
          ) * 0.35;
      }

      return;
    }

    if (mother.pause > 0 && distanceToFather < 80) {
      mother.walk = 0;
      return;
    }

    // Se ficou muito longe, acelera um pouco para alcançar.
    const speed =
      distanceToFather > 105
        ? 118
        : distanceToFather > 75
          ? 92
          : 72;

    if (distanceToTarget < 1) {
      mother.walk = 0;
      return;
    }

    const length =
      distanceToTarget || 1;

    const vx =
      dx / length;

    const vy =
      dy / length;

    const step =
      Math.min(
        speed * dt,
        distanceToTarget,
        3
      );

    let moved = false;

    // Primeiro tenta ir diretamente para o alvo.
    moved = motherTryMove(
      vx * step,
      vy * step
    );

    // Se bateu em alguma coisa, tenta deslizar por um eixo.
    if (!moved) {
      const horizontalFirst =
        Math.abs(dx) > Math.abs(dy);

      if (horizontalFirst) {
        moved =
          motherTryMove(
            Math.sign(dx) * step,
            0
          ) ||
          motherTryMove(
            0,
            Math.sign(dy) * step
          );
      } else {
        moved =
          motherTryMove(
            0,
            Math.sign(dy) * step
          ) ||
          motherTryMove(
            Math.sign(dx) * step,
            0
          );
      }
    }

    // Última tentativa: pequena curva lateral.
    if (!moved) {
      const turn =
        mother.preferredSide;

      moved =
        motherTryMove(
          -vy * step * turn,
          vx * step * turn
        );

      if (!moved) {
        mother.preferredSide *= -1;
        mother.think = 0;
      }
    }

    if (moved) {
      mother.facing =
        Math.abs(dx) > Math.abs(dy)
          ? (dx > 0 ? "right" : "left")
          : (dy > 0 ? "down" : "up");

      mother.walk += dt * 11;
    } else {
      mother.walk = 0;
    }
  }

  
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
    state.x = nextRoom === "village" ? x : housePoint(x);
    state.y = nextRoom === "village" ? y : housePoint(y);
    delete state.mother;

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

    // O diálogo começa apenas quando o pai se aproxima dos filhos.
    $("prompt").hidden = true;
  }

  function familyConversation() {
    if (state.familyFarewell || dialog || transitionBusy) return;
    state.walk = 0;
    state.facing = "up";
    openingStaticUntil = elapsed + 1.8;
    say([
      ["Pai", "Nós vamos até o mercado. Cuide do seu irmão até voltarmos."],
      ["Mãe", "Deixei uma porção para ele na cozinha. Fiquem dentro de casa."],
      ["Você", "Vocês vão demorar?"],
      ["Pai", "É só comprar algumas coisas. Antes de escurecer estaremos de volta."],
      ["Irmão", "Eu vou esperar vocês aqui."]
    ], () => {
      state.familyFarewell = true;
      updateHud();
      save();
    });
  }

  // Mesmas linhas de interferência do menu, em pulsos fracos e breves.
  function drawStatic(x, width, lines = 16) {
    for (let i = 0; i < lines; i++) {
      rect(x, Math.random() * H, width, 1, "#c8c9b116");
    }
  }

  function modal(title, text, buttons) {
    keys.clear();

    const modalCard = $("overlay").querySelector(".card");
    modalCard.className = "card";
    $("overlay").className = "";

    $("modalTitle").textContent = title;
    $("modalText").replaceChildren();
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

    if (typeof state.playerLampOn !== "boolean") {
      state.playerLampOn = false;
    }

    $("location").textContent = roomNames[state.room];
    $("objective").textContent = state.stage === "prologue"
      ? state.room === "village"
        ? "Vá com sua esposa até o mercado da cidade."
        : state.familyFarewell
          ? "Saia de casa com sua esposa."
          : "Você controla o pai. Aproxime-se dos seus filhos no térreo."
      : objectives[state.stage];
    $("day").textContent = state.day ? "DIA " + state.day : "PRÓLOGO";

    const hours = String(
      Math.floor(state.minutes / 60) % 24
    ).padStart(2, "0");

    const minutes = String(
      Math.floor(state.minutes) % 60
    ).padStart(2, "0");

    $("time").textContent = hours + ":" + minutes;

    $("timeNote").textContent = state.firstExit
      ? state.forcedSleepDue
        ? "14:00 · VOCÊ PRECISA DORMIR"
        : state.minutes >= 360
          ? "DIA · TEMPO 2× · 1 HORA = 00:40"
          : "NOITE · 1 HORA = 01:20"
      : "TEMPO PARADO · INTRODUÇÃO";

    $("inventory").textContent =
      `ALIMENTO ${state.food}  ${state.key ? " · CHAVE RESERVA" : ""}`;
  }

  // =========================================================
  // MISSÕES E INTERAÇÕES
  // =========================================================

  function interact(action) {
    if (state.stage === "prologue") {
      if (action === "children") return familyConversation();
      if (action === "outside") {
        if (!state.familyFarewell) {
          return say([["Pai", "Antes de sair, preciso falar com os meninos."]]);
        }
        openingStaticUntil = elapsed + 1.8;
        go("village", 442, 742);
        return;
      }
      if (!["gate", "home", "supply"].includes(action)) {
        return say([["Pai", "Vamos falar com os meninos e buscar mantimentos."]]);
      }
    }
    switch (action) {
      case "togglePlayerLamp":
        state.playerLampOn = !state.playerLampOn;
        save();
        return;

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
                stage("parents");
                go("bedroom", 180, 235);
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
            "A vizinha mora logo adiante. Talvez ela tenha alguma comida.",
            () => {
              state.firstExit = true;
              go("village", 442, 742);
              stage("supplies");
            }
          );
        } else {
          go("village", 442, 742);
        }
        break;

      case "home":
        if (state.stage === "prologue") {
          say([
            ["Pai", "Precisamos chegar ao mercado antes que feche."]
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
          ["Vizinha", "É melhor você voltar para casa."]
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

    for (const source of m.objects) {
      const o = state.room === "bedroom" ? roomCollision(source) : source;
      if (!o || !o.action) {
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

    // A vizinha agora pertence à própria casa; não existe mais
    // uma NPC solta no cruzamento antigo.

    return choices
      .filter(item => item.dist < 44)
      .sort((a, b) => a.dist - b.dist)[0] || null;
  }

  function solid(x, y) {
    const m = maps[state.room];
    const pad = state.room === "bedroom" ? 0 : state.room === "village" ? 18 : housePoint(47);

    if (
      x < pad ||
      y < pad ||
      x > m.w - pad ||
      y > m.h - pad
    ) {
      return true;
    }

    return m.objects.some(source => {
      const o = state.room === "bedroom" ? roomCollision(source) : source;
      return o && o.type !== "rug" &&
      x + 7 > o.x &&
      x - 7 < o.x + o.w &&
      y > o.y &&
      y - 6 < o.y + o.h;
    });
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

    updateMother(dt);

    if (state.stage === "prologue" && state.room === "foyer" &&
        !state.familyFarewell &&
        Math.hypot(state.x - children.x, state.y - children.y) < 58) {
      familyConversation();
      $("prompt").hidden = true;
      return;
    }

    near = getNear();
    $("prompt").hidden = !near;

    if (near) {
      $("prompt").textContent = "[E] " + near.label;
    }

    if (state.firstExit) {
      const old = state.minutes;

      // NOVO CICLO:
      // 00:00–05:59 -> 1 hora do jogo = 1m20s reais.
      // 06:00–14:00 -> tempo 2x mais rápido = 40s reais por hora.
      // Às 14:00 o relógio para até o player dormir.
      const timeRate =
        state.minutes >= 360 ? 1.5 : 0.75;

      state.minutes = Math.min(
        840,
        state.minutes + dt * timeRate
      );

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
    // Resolução de desenho independente das coordenadas lógicas do jogo.
    const renderScale = 3;
    if (canvas.width !== W * renderScale || canvas.height !== H * renderScale) {
      canvas.width = W * renderScale;
      canvas.height = H * renderScale;
      canvas.style.imageRendering = "auto";
    }
    c.setTransform(renderScale, 0, 0, renderScale, 0, 0);
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
    if (photoScene) return;
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

   if (!dialog && !transitionBusy) {
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
  // TELAS VISUAIS — COMO JOGAR E CRÉDITOS
  // =========================================================

  function openHelpScreen() {
    modal("Como jogar", "", [["Fechar", closeModal]]);

    const card = $("overlay").querySelector(".card");
    card.className = "card info-card help-card";
    $("overlay").className = "info-overlay";

    $("modalLabel").textContent = "REGISTROS DA CASA";
    $("modalTitle").textContent = "COMO JOGAR";

    $("modalText").innerHTML = `
      <div class="info-art-slot help-art-slot" aria-hidden="true">
        <span>ESPAÇO RESERVADO PARA ARTE / IMAGEM</span>
      </div>

      <div class="help-intro">
        Explore com calma. Algumas ações já fazem parte do protótipo;
        outras estão previstas para acompanhar a evolução do jogo.
      </div>

      <div class="help-grid">
        <article class="control-card">
          <span class="control-icon">◆</span>
          <div>
            <strong>ANDAR</strong>
            <kbd>WASD</kbd> <kbd>SETAS</kbd>
            <p>Mova-se pelos cômodos, pela casa e pela vila.</p>
          </div>
        </article>

        <article class="control-card">
          <span class="control-icon">◎</span>
          <div>
            <strong>INTERAGIR</strong>
            <kbd>E</kbd>
            <p>Fale, examine, colete itens e use portas ou objetos próximos.</p>
          </div>
        </article>

        <article class="control-card">
          <span class="control-icon">✦</span>
          <div>
            <strong>ATAQUE</strong>
            <kbd>ESPAÇO</kbd>
            <p>Execute o ataque básico quando houver uma ameaça próxima.</p>
          </div>
        </article>

        <article class="control-card">
          <span class="control-icon">»</span>
          <div>
            <strong>CORRER</strong>
            <kbd>SHIFT</kbd>
            <p>Acelere o movimento quando precisar atravessar uma área rapidamente.</p>
          </div>
        </article>

        <article class="control-card">
          <span class="control-icon">▱</span>
          <div>
            <strong>DIÁRIO</strong>
            <kbd>J</kbd>
            <p>Consulte pistas, registros e informações importantes da investigação.</p>
          </div>
        </article>

        <article class="control-card">
          <span class="control-icon">Ⅱ</span>
          <div>
            <strong>PAUSAR</strong>
            <kbd>ESC</kbd>
            <p>Pare o jogo e o relógio enquanto organiza o próximo passo.</p>
          </div>
        </article>

        <article class="control-card planned">
          <span class="control-icon">↝</span>
          <div>
            <strong>DASH <em>PLANEJADO</em></strong>
            <kbd>Q</kbd>
            <p>Um avanço rápido para fuga, exploração e situações de perigo.</p>
          </div>
        </article>

        <article class="control-card planned">
          <span class="control-icon">◌</span>
          <div>
            <strong>ESQUIVA / EMPURRÃO <em>PLANEJADO</em></strong>
            <span class="control-key-muted">EM DESENVOLVIMENTO</span>
            <p>Novas opções defensivas para sobreviver a encontros mais perigosos.</p>
          </div>
        </article>
      </div>

      <div class="help-future">
        <span>AINDA VAI CRESCER</span>
        <p>Inventário, lanterna, novas habilidades, escolhas com consequências,
        mais interações com NPCs e novos eventos dentro e fora da casa.</p>
      </div>

      <blockquote class="info-quote">
        “Observe. Escute. Nem tudo o que parece vazio está realmente em silêncio.”
      </blockquote>
    `;
  }

  function openCreditsScreen() {
    modal("Créditos", "", [["Fechar", closeModal]]);

    const card = $("overlay").querySelector(".card");
    card.className = "card info-card credits-card";
    $("overlay").className = "info-overlay credits-overlay";

    $("modalLabel").textContent = "A QUINTA SOMBRA";
    $("modalTitle").textContent = "CRÉDITOS";

    $("modalText").innerHTML = `
      <div class="info-art-slot credits-art-slot" aria-hidden="true">
        <span>ESPAÇO RESERVADO PARA ARTE / IMAGEM</span>
      </div>

      <div class="credits-mark" aria-hidden="true">
        <span></span><i>◇</i><span></span>
      </div>

      <div class="credit-entry">
        <small>DESENVOLVIMENTO, DIREÇÃO E IDEIAS</small>
        <strong>Pedro</strong>
      </div>

      <div class="credit-divider"></div>

      <div class="credit-entry">
        <small>AUXÍLIO DE PROGRAMAÇÃO</small>
        <strong>ChatGPT</strong>
      </div>

      <blockquote class="info-quote credits-quote">
        “Nem todo silêncio significa paz.”
      </blockquote>
    `;
  }

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

      migrateHouseSave(saved);
      state = saved;
      // O corpo mantém seu tamanho: afasta saves antigos das bordas dos móveis.
      if (solid(state.x, state.y)) {
        const origin = { x: state.x, y: state.y };
        let placed = false;
        for (let radius = 2; radius <= 40 && !placed; radius += 2) {
          for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1],
                                 [1,1],[-1,1],[1,-1],[-1,-1]]) {
            const x = origin.x + dx * radius;
            const y = origin.y + dy * radius;
            if (!solid(x, y)) {
              state.x = x;
              state.y = y;
              placed = true;
              break;
            }
          }
        }
      }
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

  $("help").onclick = openHelpScreen;
  $("credits").onclick = openCreditsScreen;

  // =========================================================
  // CONTINUAÇÃO 0.2
  // Estoque limitado, perigo, invasão e defesa do irmão.
  // =========================================================

  const previous = {
    enterGame,
    update,
    drawWorld,
    updateHud,
    interact,
    getNear
  };

  // ---------------------------------------------------------
  // NOVOS DADOS E COMPATIBILIDADE COM PROGRESSOS ANTIGOS
  // ---------------------------------------------------------

  function prepareSystems() {
    if (!state) return;

    if (!Number.isFinite(state.stockDay)) {
      state.stockDay = state.day;

      // Considera comida já carregada e a primeira entrega
      // ao converter um progresso da versão anterior.
      state.stock = Math.max(
        0,
        3 - state.food - (state.finished ? 1 : 0)
      );
    }

    if (state.stockDay !== state.day) {
      state.stockDay = state.day;
      state.stock = 3;
    }

    if (!state.danger) {
      state.danger = {
        phase: "safe",
        time: 0,
        countdown: 60,
        cooldown: 12,
        victories: 0,
        enemy: null,
        punch: 0
      };
    }
  }

  function dangerActive() {
    return (
      state.danger.phase !== "safe" &&
      state.danger.phase !== "lost"
    );
  }

  // ---------------------------------------------------------
  // PONTO DE RETORNO E DERROTA
  // ---------------------------------------------------------

  function rememberSafePoint() {
    const snapshot = { ...state };

    delete snapshot.rescueCheckpoint;

    state.rescueCheckpoint = JSON.parse(
      JSON.stringify(snapshot)
    );
  }

  function showDefeat() {
    modal(
      "Você não chegou a tempo",
      "O invasor encontrou seu irmão.\n\nVolte ao ponto anterior à invasão para tentar outra estratégia.",
      [
        [
          "Tentar novamente",
          () => {
            if (!state.rescueCheckpoint) return;

            state = JSON.parse(
              JSON.stringify(state.rescueCheckpoint)
            );

            state.gameOver = false;
            state.danger.phase = "safe";
            state.danger.time = 0;
            state.danger.enemy = null;
            state.danger.cooldown = 12;

            closeModal();
            enterGame();
            save();
          }
        ],
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
  }

  // ---------------------------------------------------------
  // INVASOR E PERCURSO
  // ---------------------------------------------------------

  function startInvasion() {
    rememberSafePoint();

    const d = state.danger;

    d.phase = "yellow";
    d.time = 0;
    d.countdown = 60;

    d.enemy = {
      room: "village",
      x: 690,
      y: 740,
      hp: 3,
      flash: 0,
      walk: 0,
      facing: "left",
      path: [
        [500, 740],
        [500, 664]
      ]
    };

    save();
  }

  function advanceInvader(dt) {
    const e = state.danger.enemy;

    if (!e) return;

    e.flash = Math.max(0, e.flash - dt);

    let distance = dt * 34;
    let moved = false;

    while (distance > 0 && e.path.length) {
      const target = e.path[0];

      const dx = target[0] - e.x;
      const dy = target[1] - e.y;
      const length = Math.hypot(dx, dy);

      if (length < 0.01) {
        e.path.shift();
        continue;
      }

      const step = Math.min(distance, length, 2);

      const x = e.x + dx / length * step;
      const y = e.y + dy / length * step;

      const blocked = maps[e.room].objects.some(o =>
        o.type !== "rug" &&
        x + 7 > o.x &&
        x - 7 < o.x + o.w &&
        y > o.y &&
        y - 6 < o.y + o.h
      );

      if (blocked) break;

      e.x = x;
      e.y = y;

      e.facing = Math.abs(dx) > Math.abs(dy)
        ? (dx > 0 ? "right" : "left")
        : (dy > 0 ? "down" : "up");

      distance -= step;
      moved = true;
    }

    e.walk = moved ? e.walk + dt * 10 : 0;
  }

  // ---------------------------------------------------------
  // ETAPAS DA AMEAÇA
  // ---------------------------------------------------------

  function updateDanger(dt) {
    const d = state.danger;

    d.punch = Math.max(0, d.punch - dt);

    if (!state.finished || state.gameOver) return;

    if (d.phase === "safe") {
      // Uma nova ameaça começa apenas fora de casa, à noite.
      const isNight = (
        state.minutes < 360 ||
        state.minutes >= 1080
      );

      if (state.room === "village" && isNight) {
        d.cooldown -= dt;

        if (d.cooldown <= 0) {
          startInvasion();
        }
      }

      return;
    }

    d.time += dt;

    advanceInvader(dt);

    const e = d.enemy;

    if (
      d.phase === "yellow" &&
      d.time >= 35 &&
      !e.path.length
    ) {
      d.phase = "orange";
      d.time = 0;

      save();
    } else if (
      d.phase === "orange" &&
      d.time >= 25
    ) {
      d.phase = "red";
      d.time = 0;

      e.room = "foyer";
      e.x = housePoint(550);
      e.y = housePoint(305);

      e.path = [
        [370, 305],
        [370, 255]
      ].map(point => point.map(housePoint));

      save();
    } else if (
      d.phase === "red" &&
      d.time >= 20 &&
      !e.path.length
    ) {
      d.phase = "critical";
      d.time = 0;
      d.countdown = 60;

      e.room = "hall";
      e.x = housePoint(450);
      e.y = housePoint(200);

      e.path = [
        [160, 200],
        [160, 360]
      ].map(point => point.map(housePoint));

      save();
    } else if (d.phase === "critical") {
      d.countdown = Math.max(0, d.countdown - dt);

      if (
        e.room === "hall" &&
        !e.path.length
      ) {
        e.room = "brother";
        e.x = housePoint(490);
        e.y = housePoint(85);

        e.path = [
          [490, 240],
          [400, 240],
          [400, 205]
        ].map(point => point.map(housePoint));

        save();
      }

      if (d.countdown <= 0) {
        d.phase = "lost";
        state.gameOver = true;

        keys.clear();
        save();
        showDefeat();
      }
    }
  }

  // ---------------------------------------------------------
  // SOCO BÁSICO
  // ---------------------------------------------------------

  function punchInvader() {
    const d = state.danger;

    if (!d || d.punch > 0) return;

    d.punch = 0.45;

    const e = d.enemy;

    if (
      !e ||
      e.room !== state.room ||
      Math.hypot(e.x - state.x, e.y - state.y) > 44
    ) {
      return;
    }

    e.hp--;
    e.flash = 0.22;

    if (e.hp <= 0) {
      d.phase = "safe";
      d.time = 0;
      d.countdown = 60;
      d.enemy = null;

      // Intervalo antes de outra ameaça.
      d.cooldown = 180;
      d.victories++;

      delete state.rescueCheckpoint;

      save();

      say([
        [
          "Você",
          "Ele fugiu. Preciso verificar se meu irmão está bem."
        ],
        [
          "Você",
          "Da próxima vez, posso interceptá-lo antes de entrar."
        ]
      ]);
    } else {
      save();
    }
  }

  // ---------------------------------------------------------
  // INTEGRAÇÃO COM O CÓDIGO EXISTENTE
  // ---------------------------------------------------------

  enterGame = function () {
    prepareSystems();
    previous.enterGame();

    if (state.gameOver) {
      showDefeat();
    }
  };

  interact = function (action) {
    prepareSystems();

    if (state.gameOver) return;

    // Estoque da venda independente da comida carregada.
    if (
      action === "supply" &&
      state.stage !== "prologue"
    ) {
      if (state.stock <= 0) {
        say([
          "A caixa está vazia. A próxima reposição será amanhã."
        ]);
      } else if (state.food >= 2) {
        say([
          "Minha bolsa está cheia. Consigo carregar duas porções."
        ]);
      } else {
        const stockDay = state.stockDay;

        say(
          [
            `Há ${state.stock} porção(ões) na caixa. Vou pegar uma.`
          ],
          () => {
            if (
              state.stockDay !== stockDay ||
              state.stock <= 0 ||
              state.food >= 2
            ) {
              return;
            }

            state.stock--;
            state.food++;

            if (state.stage === "supplies") {
              stage("return");
            }

            updateHud();
            save();
          }
        );
      }

      return;
    }

    // A primeira entrega agora abre a continuação.
    if (
      action === "brother" &&
      (
        state.stage === "return" ||
        state.stage === "free"
      )
    ) {
      if (!state.finished && state.food > 0) {
        say(
          [
            [
              "Irmão",
              "Alguém ficou olhando para a janela enquanto você estava fora."
            ],
            [
              "Você",
              "Trouxe comida. Vou conferir a entrada."
            ],
            [
              "Tutorial",
              "Ao sair novamente, observe a barra PERIGO NA CASA. Se alguém se aproximar, você pode voltar e interceptá-lo."
            ],
            [
              "Tutorial",
              "Use ESPAÇO perto do invasor para dar um soco. Três golpes o fazem fugir. Se alcançar o andar de cima, você terá 60 segundos para impedi-lo."
            ]
          ],
          () => {
            state.food--;
            state.finished = true;

            stage("free");
            save();
          }
        );
      } else if (dangerActive()) {
        say([
          [
            "Irmão",
            "Eu ouvi os passos. Por favor, não deixa ele chegar aqui."
          ]
        ]);
      } else if (state.food > 0) {
        say(
          [
            [
              "Irmão",
              "Obrigado. Vou guardar essa porção para depois."
            ]
          ],
          () => {
            state.food--;

            updateHud();
            save();
          }
        );
      } else {
        say([
          [
            "Irmão",
            state.danger.victories
              ? "Os passos pararam. Você conseguiu?"
              : "Toma cuidado lá fora."
          ]
        ]);
      }

      return;
    }

    // Impede pular uma invasão dormindo.
    if (action === "bed" && state.firstExit) {
      if (dangerActive()) {
        say([
          "Não posso dormir enquanto alguém está rondando a casa."
        ]);

        return;
      }

      // Evita fazer o relógio voltar para as 18h.
      if (state.minutes >= 1080) {
        say([
          "Já é noite. Preciso ficar atento à casa."
        ]);

        return;
      }
    }

    previous.interact(action);
  };

  getNear = function () {
    const target = previous.getNear();

    if (state.room !== "village") return target;

    // A interação fica na caixa, não no prédio inteiro.
    const distance = Math.hypot(
      state.x - 202.5,
      state.y - 399
    );

    if (distance < 38) {
      return {
        label: "Examinar a caixa da venda",
        action: "supply"
      };
    }

    return target && target.action === "supply"
      ? null
      : target;
  };

  updateHud = function () {
    prepareSystems();
    previous.updateHud();

    if (!state) return;

    $("inventory").textContent +=
      ` · VENDA ${state.stock}/3`;

    if (state.stage === "free") {
      const d = state.danger;

      $("objective").textContent = dangerActive()
        ? "Proteja seu irmão. ESPAÇO: soco perto do invasor."
        : d.victories
          ? "O irmão está seguro. Explore e acompanhe os sinais."
          : "Confira o lado de fora da casa. ESPAÇO: soco.";
    }
  };

  update = function (dt) {
    prepareSystems();

    if (
      state &&
      state.gameOver &&
      mode === "game"
    ) {
      if ($("overlay").hidden) {
        showDefeat();
      }

      return;
    }

    previous.update(dt);

    if (
      mode !== "game" ||
      !state ||
      dialog ||
      transitionBusy ||
      !$("overlay").hidden
    ) {
      return;
    }

    updateDanger(dt);
    updateHud();
  };

  // ---------------------------------------------------------
  // DESENHO DO INVASOR, SOCO E BARRA DE PERIGO
  // ---------------------------------------------------------

  drawWorld = function () {
    previous.drawWorld();
    prepareSystems();

    const d = state.danger;
    const e = d.enemy;

    if (e && e.room === state.room) {
      c.save();

      c.translate(
        -Math.floor(camera.x),
        -Math.floor(camera.y)
      );

      person(
        e.x,
        e.y,
        "npcMale",
        e.walk,
        e.facing
      );

      // Capuz e roupa provisórios do invasor.
      rect(
        e.x - 7,
        e.y - 31,
        14,
        10,
        e.flash > 0 ? "#e2c9a2" : "#282737"
      );

      rect(
        e.x - 5,
        e.y - 20,
        10,
        12,
        "#463945"
      );

      for (let i = 0; i < 3; i++) {
        rect(
          e.x - 10 + i * 8,
          e.y - 43,
          5,
          3,
          i < e.hp ? "#cf7160" : "#39343b"
        );
      }

      txt(
        "ESPAÇO · SOCO",
        e.x - 31,
        e.y - 49,
        "#e5cda8",
        7
      );

      c.restore();
    }

    // O soco agora usa a animação thrust.png do player.

    if (!state.finished) return;

    const styles = {
      safe: [
        "#7caf8b", 0.07, "SEGURO"
      ],
      yellow: [
        "#d5c264", 0.32, "ALGUÉM RONDA A CASA"
      ],
      orange: [
        "#dc964e", 0.60, "TENTANDO ENTRAR"
      ],
      red: [
        "#d26b62", 0.84, "INVASOR NO TÉRREO"
      ],
      critical: [
        "#e55757", 1, "PROTEJA SEU IRMÃO"
      ],
      lost: [
        "#bd4848", 1, "TARDE DEMAIS"
      ]
    };

    const [color, fill, label] = styles[d.phase];

    const x = W - 180;
    const y = H - 69;

    rect(x, y, 168, 48, "#0a131ded");

    txt(
      "PERIGO NA CASA",
      x + 8,
      y + 11,
      "#bcbba9",
      7
    );

    if (d.phase === "critical") {
      txt(
        Math.ceil(d.countdown) + "s",
        x + 133,
        y + 11,
        color,
        9
      );
    }

    txt(
      label,
      x + 8,
      y + 25,
      color,
      7
    );

    rect(
      x + 8,
      y + 33,
      152,
      6,
      "#30383c"
    );

    rect(
      x + 8,
      y + 33,
      Math.round(152 * fill),
      6,
      color
    );
  };

  // ---------------------------------------------------------
  // CONTROLE DO SOCO
  // ---------------------------------------------------------

  window.addEventListener(
    "keydown",
    event => {
      if (mode !== "game" || !state) return;
      if (photoScene) return;

      if (state.gameOver) {
        if (
          ["escape", "e", " "].includes(
            event.key.toLowerCase()
          )
        ) {
          event.preventDefault();
          event.stopImmediatePropagation();
        }

        return;
      }

      if (
        event.code !== "Space" &&
        event.key !== " "
      ) {
        return;
      }

      event.preventDefault();
      event.stopImmediatePropagation();

      if (
        event.repeat ||
        dialog ||
        transitionBusy ||
        !$("overlay").hidden
      ) {
        return;
      }

      prepareSystems();

      if (state.firstExit) {
        punchInvader();
      }
    },
    true
  );

  // ---------------------------------------------------------
  // VERSÃO E AJUDA ATUALIZADAS
  // ---------------------------------------------------------

  
// =========================================================

  $("help").onclick = () => modal(
    "Como jogar",
    "WASD / setas: andar. Shift: correr. E: interagir. Esc: pausar.\n\nESPAÇO: soco. Aproxime-se do invasor e acerte três golpes para expulsá-lo. Você pode interceptá-lo antes de entrar.\n\nA primeira ameaça começa após alimentar seu irmão e sair novamente. Amarelo: aproximação. Laranja: tentativa de entrada. Vermelho: invasor no térreo. Barra cheia: 60 segundos para salvar seu irmão.\n\nA venda possui três porções por dia. Sua bolsa comporta duas. O estoque é salvo e reposto à meia-noite. Pausas e diálogos interrompem o relógio e a ameaça.",
    [
      ["Voltar", closeModal]
    ]
  );

  // TRANSIÇÕES DE ABERTURA E DE PORTAS
const enterGameBeforeTransitions = enterGame;
const goBeforeTransitions = go;

const START_TRANSITION_MS = 5000;
const DOOR_TRANSITION_MS = 1400;

function runScreenTransition(title, hint, duration, changeRoom) {
  transitionBusy = true;
  keys.clear();

  $('transitionTitle').textContent = title;
  $('transitionHint').textContent = hint;
  $('transition').classList.add('active');

  const fadeTime = 650;
  const holdTime = Math.max(0, duration - fadeTime * 2);

  setTimeout(() => {
    if (typeof changeRoom === 'function') changeRoom();

    setTimeout(() => {
      $('transition').classList.remove('active');

      setTimeout(() => {
        transitionBusy = false;
        save();
      }, fadeTime);
    }, holdTime);
  }, fadeTime);
}

enterGame = function () {
  const opening =
    state &&
    state.stage === 'prologue' &&
    !state.startupShown;

  if (!opening) {
    enterGameBeforeTransitions();
    return;
  }

  state.startupShown = true;

  // A abertura precisa cobrir a cena ANTES de o menu sumir.
  // Sem isso, o navegador consegue desenhar 1 frame do térreo
  // antes do fade preto ficar visível.
  transitionBusy = true;
  keys.clear();

  const transition = $('transition');

  $('transitionTitle').textContent =
    'A QUINTA SOMBRA';

  $('transitionHint').textContent =
    '14:00 · A família ainda está reunida.';

  // Cobre instantaneamente, sem animação de entrada.
  transition.style.transition = 'none';
  transition.style.opacity = '1';
  transition.classList.add('active');

  // Só agora revela o jogo atrás da tela preta.
  enterGameBeforeTransitions();

  // Força o navegador a aplicar a cobertura antes de
  // restaurar a animação normal.
  void transition.offsetWidth;

  requestAnimationFrame(() => {
    transition.style.transition =
      'opacity 0.65s';

    // Mantém o cartão de abertura visível e,
    // só depois, revela o andar térreo.
    setTimeout(() => {
      transition.classList.remove('active');
      transition.style.opacity = '';

      setTimeout(() => {
        transitionBusy = false;
        save();
      }, 650);
    }, START_TRANSITION_MS);
  });
};

go = function (nextRoom, x, y) {
  if (state?.stage === "prologue" && nextRoom !== "village") {
    say([["Pai", state.familyFarewell
      ? "Precisamos sair. A porta de entrada fica à direita."
      : "Os meninos estão aqui no térreo. Vou falar com eles."]]);
    return;
  }
  if (!state || transitionBusy || state.room === nextRoom) {
    goBeforeTransitions(nextRoom, x, y);
    return;
  }

  const labels = {
    foyer: 'Entrada',
    hall: 'Corredor',
    parents: 'Quarto dos pais',
    brother: 'Quarto do irmão',
    bedroom: 'Seu quarto',
    living: 'Sala',
    kitchen: 'Cozinha',
    attic: 'Sótão',
    basement: 'Porão',
    village: 'Vila'
  };

  const destination = labels[nextRoom] || 'Outro cômodo';

  runScreenTransition(
    '...',
    `Indo para ${destination}.`,
    DOOR_TRANSITION_MS,
    () => {
      goBeforeTransitions(nextRoom, x, y);
      if (state.stage === "prologue" && nextRoom === "village") {
        openingStaticUntil = elapsed + 2;
      }
    }
  );
};


// CONTINUAÇÃO 0.3 — PISTAS E FOTOGRAFIA
let photoScene = null;

const chapterBase = {
  update,
  updateHud,
  getNear,
  interact,
  drawWorld
};

const clueText = {
  list:
    "Pão, feijão, sal, óleo e ataduras. " +
    "Sob os riscos: DUAS CÓPIAS. No rodapé: LUA.",

  photo:
    "Quatro pessoas, cinco sombras. No verso: OLHO.",

  note:
    "Se voltarmos diferentes, compare a fotografia. " +
    "A câmera está no segundo baú do sótão. " +
    "Feche a sequência com CASA."
};

const clueSpots = [
  [
    "parents", 125, 165,
    "list", "Ler lista de mantimentos"
  ],
  [
    "parents", 440, 170,
    "photo", "Examinar fotografia"
  ],
  [
    "parents", 320, 250,
    "note", "Ler bilhete"
  ],
  [
    "bedroom", 110, 240,
    "normal", "Observar sua fotografia"
  ],
  [
    "attic", 410, 175,
    "chest", "Abrir baú da câmera"
  ]
];

// Mantém as pistas alinhadas aos móveis após compactar os cômodos.
for (const spot of clueSpots) {
  spot[1] = housePoint(spot[1]);
  spot[2] = housePoint(spot[2]);
}

function chapter() {
  if (!state) return null;

  if (!state.investigation) {
    state.investigation = {
      phase: "waiting",
      clues: [],
      camera: false,
      photo: null
    };
  }

  return state.investigation;
}

function chapterObjective() {
  const q = chapter();

  if (!q || q.phase === "waiting") return null;

  return {
    brother:
      "Converse com seu irmão sobre a invasão.",

    clues:
      "Investigue o quarto dos pais: " +
      q.clues.length + "/3 pistas. J: diário.",

    chest:
      "Abra o segundo baú no sótão. " +
      "Consulte as pistas com J.",

    camera:
      "Aproxime-se da figura diante do portão norte.",

    done:
      "Registro salvo. O caminho oeste será a próxima " +
      "investigação. J: diário."
  }[q.phase];
}

const clueImages = {
  list: "assets/ui/journal/supply-list.png",
  note: "assets/ui/journal/note-parents.png"
};

function openJournal(view = "book") {
  chapter();

  modal(
    "Diário de investigação",
    "",
    [["Fechar", closeModal]]
  );

  renderJournalView(view);
}

function renderJournalView(view) {
  const q = chapter();
  const text = $("modalText");

  const collected = q.clues.filter(
    id => id === "list" || id === "note"
  );

  text.innerHTML = "";

  const layout = document.createElement("div");
  layout.className = "journal-layout";

  const page = document.createElement("div");
  page.className = "journal-page";

  if (view === "book") {
    const book = document.createElement("div");

    book.className = "journal-book-sprite";
    book.setAttribute(
      "aria-label",
      "Livro de pistas aberto"
    );

    page.append(book);

    const title = document.createElement("strong");

    title.className = "journal-page-title";
    title.textContent =
      "REGISTRO DE INVESTIGAÇÃO";

    page.append(title);

    const entries = document.createElement("div");
    entries.className = "journal-entries";

    if (!collected.length) {
      entries.textContent =
        "Nenhuma pista registrada ainda.";
    } else {
      for (const id of collected) {
        const item = document.createElement("button");

        item.className = "journal-entry";
        item.textContent =
          id === "list"
            ? "Lista de mantimentos"
            : "Bilhete dos pais";

        item.onclick = () =>
          renderJournalView(id);

        entries.append(item);
      }
    }

    page.append(entries);
  } else if (view === "letters") {
    const title = document.createElement("strong");

    title.className = "journal-page-title";
    title.textContent = "CARTAS COLETADAS";

    page.append(title);

    const cards = document.createElement("div");
    cards.className = "journal-cards";

    if (!collected.length) {
      cards.textContent =
        "Nenhuma carta coletada ainda.";
    } else {
      for (const id of collected) {
        const card = document.createElement("button");

        card.className = "journal-card";
        card.onclick = () =>
          renderJournalView(id);

        const thumbnail =
          document.createElement("img");

        thumbnail.src = clueImages[id];
        thumbnail.alt =
          id === "list"
            ? "Lista de mantimentos"
            : "Bilhete dos pais";

        card.append(thumbnail);

        const label =
          document.createElement("span");

        label.textContent =
          id === "list"
            ? "Lista de mantimentos"
            : "Bilhete dos pais";

        card.append(label);
        cards.append(card);
      }
    }

    page.append(cards);
  } else {
    const id = view;

    const image = document.createElement("img");

    image.className = "journal-clue-image";
    image.src = clueImages[id];
    image.alt =
      id === "list"
        ? "Lista de mantimentos coletada"
        : "Bilhete dos pais coletado";

    image.title = "Clique para ampliar";

    image.onclick = () =>
      enlargeClue(id);

    page.append(image);

    const hint = document.createElement("p");

    hint.className = "journal-hint";
    hint.textContent =
      "Clique na pista para ampliar.";

    page.append(hint);
  }

  const rail = document.createElement("aside");
  rail.className = "journal-rail";

  const bookButton =
    document.createElement("button");

  bookButton.className =
    "journal-rail-button" +
    (view === "book" ? " active" : "");

  bookButton.textContent = "LIVRO";
  bookButton.title = "Abrir o livro";

  bookButton.onclick = () =>
    renderJournalView("book");

  rail.append(bookButton);

  const noteButton =
    document.createElement("button");

  noteButton.className =
    "journal-rail-button" +
    (view === "letters" ? " active" : "");

  noteButton.textContent = "CARTAS";
  noteButton.title =
    "Ver as cartas coletadas";

  noteButton.onclick = () =>
    renderJournalView("letters");

  noteButton.disabled = !collected.length;

  rail.append(noteButton);

  layout.append(page, rail);
  text.append(layout);
}

function enlargeClue(id) {
  const image = document.createElement("img");

  image.src = clueImages[id];
  image.alt =
    id === "list"
      ? "Lista de mantimentos ampliada"
      : "Bilhete dos pais ampliado";

  image.className = "journal-clue-large";

  modal(
    id === "list"
      ? "Lista de mantimentos"
      : "Bilhete dos pais",
    "",
    [
      [
        "Voltar ao diário",
        () => renderJournalView(id)
      ],
      ["Fechar", closeModal]
    ]
  );

  $("modalText").append(image);
}

function showPhoto(first) {
  modal(
    "Registro 01 — A figura no portão",

    "Ela estava de costas. Na fotografia, " +
    "está olhando para mim.",

    [
      [
        "Guardar",
        () => {
          closeModal();

          if (first) {
            say(
              [
                [
                  "Você",
                  "Ela sumiu… mas continua na fotografia."
                ],
                [
                  "Você",
                  "Atrás dela há uma marca apontando para o oeste."
                ]
              ],
              () => {
                photoScene = null;
                keys.clear();
                updateHud();
                save();
              }
            );
          }
        }
      ]
    ]
  );

  const img = document.createElement("img");

  img.src = chapter().photo;

  img.alt =
    "Figura escura diante do portão, com dois olhos " +
    "claros e uma marca para oeste.";

  img.width = 320;
  img.style.maxWidth = "100%";
  img.style.imageRendering = "pixelated";

  $("modalText").append(
    document.createElement("br"),
    img
  );
}

function captureEvidence() {
  if (
    !photoScene ||
    photoScene.phase !== "ready"
  ) {
    return;
  }

  photoScene.phase = "review";

  // Fotografia provisória feita em Canvas.
  const shot = document.createElement("canvas");

  shot.width = 320;
  shot.height = 180;

  const p = shot.getContext("2d");

  p.fillStyle = "#24312d";
  p.fillRect(0, 0, 320, 180);

  p.fillStyle = "#75654d";
  p.fillRect(30, 25, 260, 10);

  for (let x = 40; x < 290; x += 25) {
    p.fillRect(x, 35, 5, 135);
  }

  p.fillStyle = "#080d12";
  p.fillRect(139, 68, 42, 93);

  p.beginPath();
  p.arc(160, 62, 21, 0, Math.PI * 2);
  p.fill();

  p.fillStyle = "#d8dfc8";
  p.fillRect(149, 60, 4, 3);
  p.fillRect(167, 60, 4, 3);

  p.font = "14px monospace";
  p.fillText("< OESTE", 35, 155);

  const q = chapter();

  q.photo = shot.toDataURL("image/png");
  q.phase = "done";

  $("prompt").hidden = true;

  save();
  showPhoto(true);
}

function beginPhoto() {
  if (photoScene || chapter().photo) return;

  photoScene = {
    phase: "fade",
    time: 0
  };

  keys.clear();
  state.walk = 0;
  near = null;

  $("prompt").hidden = true;
}

function chestPuzzle(sequence = []) {
  const symbols = ["LUA", "OLHO", "CASA"];

  modal(
    "Fechadura de três símbolos",

    "Escolha a ordem indicada nas três pistas.\n" +
      sequence.join(" → "),

    [
      ...symbols.map(symbol => [
        symbol,

        () => {
          const next = [...sequence, symbol];

          if (next.length < 3) {
            return chestPuzzle(next);
          }

          if (next.join("/") !== symbols.join("/")) {
            return modal(
              "O baú continua fechado",

              "A sequência não reage. Posso tentar novamente.",

              [
                [
                  "Tentar novamente",
                  () => chestPuzzle()
                ],
                ["Voltar", closeModal]
              ]
            );
          }

          closeModal();

          say(
            [
              ["Você", "Uma câmera… Ainda funciona."],
              [
                "Anotação",
                "A imagem guarda aquilo que os olhos esquecem."
              ],
              [
                "Você",
                "Há uma figura perto do portão. Preciso registrá-la."
              ]
            ],
            () => {
              chapter().camera = true;
              chapter().phase = "camera";

              updateHud();
              save();
            }
          );
        }
      ]),

      ["Voltar", closeModal]
    ]
  );
}

getNear = function () {
  const q = chapter();

  if (photoScene) return null;

  if (
    q &&
    !["waiting", "brother"].includes(q.phase)
  ) {
    const spot = clueSpots.find(
      ([room, x, y, id]) =>
        state.room === room &&
        Math.hypot(state.x - x, state.y - y) < 35 &&
        (id !== "chest" || q.clues.length === 3)
    );

    if (spot) {
      return {
        action: "clue:" + spot[3],
        label: spot[4]
      };
    }
  }

  return chapterBase.getNear();
};

interact = function (action) {
  const q = chapter();

  if (
    action === "brother" &&
    q.phase === "brother"
  ) {
    say(
      [
        [
          "Irmão",
          "Ouvi a voz da mãe perto do porão. " +
          "Mas não sei se era ela."
        ],
        [
          "Irmão",
          "Ela jamais falaria uma coisa assim."
        ],
        ["Você", "O quê? O que ela disse?"],
        ["Irmão", "Não é nada… esquece."]
      ],
      () => {
        q.phase = "clues";

        updateHud();
        save();
      }
    );

    return;
  }

  if (!action.startsWith("clue:")) {
    return chapterBase.interact(action);
  }

  const id = action.slice(5);

  if (id === "chest") {
    if (q.camera) {
      return say([
        "O baú está vazio. A câmera está comigo."
      ]);
    }

    return chestPuzzle();
  }

  if (id === "normal") {
    return say([
      "Nossa foto na escada. Quatro pessoas, quatro sombras."
    ]);
  }

 say([clueText[id]], () => {
  if (!q.clues.includes(id)) {
    q.clues.push(id);
  }

  if (
    q.clues.length === 3 &&
    q.phase === "clues"
  ) {
    q.phase = "chest";
  }

  updateHud();
  save();
});
};

updateHud = function () {
  chapterBase.updateHud();

  if (!state) return;

  const objective = chapterObjective();

  if (objective && !dangerActive()) {
    $("objective").textContent = objective;
  }
};

update = function (dt) {
  const q = chapter();

  // Durante a foto, não atualiza movimento,
  // relógio, exposição ao sol ou invasores.
  if (photoScene) {
    if (
      photoScene.phase === "fade" &&
      document.visibilityState !== "hidden"
    ) {
      photoScene.time += dt;

      // Reposiciona no instante de tela preta.
      if (
        photoScene.time >= 0.4 &&
        !photoScene.placed
      ) {
        state.x = 500;
        state.y = 210;
        state.facing = "up";

        photoScene.placed = true;
      }

      if (photoScene.time >= 0.8) {
        photoScene.phase = "ready";

        $("prompt").textContent = "[E] Fotografar";
        $("prompt").hidden = false;
      }
    }

    return;
  }

  chapterBase.update(dt);

  if (
    !q ||
    mode !== "game" ||
    dialog ||
    transitionBusy ||
    !$("overlay").hidden ||
    state.gameOver
  ) {
    return;
  }

  // Também funciona em saves com a invasão já vencida.
  if (
    q.phase === "waiting" &&
    state.danger.victories > 0
  ) {
    q.phase = "brother";

    updateHud();
    save();
  }

  // Dispara apenas perto do alvo e sem invasão ativa.
  if (
    q.phase === "camera" &&
    state.room === "village" &&
    !dangerActive() &&
    Math.hypot(state.x - 500, state.y - 175) < 85
  ) {
    beginPhoto();
  }
};

drawWorld = function () {
  chapterBase.drawWorld();

  const q = chapter();

  c.save();

  c.translate(
    -Math.floor(camera.x),
    -Math.floor(camera.y)
  );

  // Marcadores provisórios das pistas.
  if (
    q &&
    !["waiting", "brother"].includes(q.phase)
  ) {
    for (const [room, x, y, id] of clueSpots) {
      if (state.room !== room) continue;

      rect(
        x - 5,
        y - 7,
        10,
        7,
        q.clues.includes(id) ? "#69756a" : "#dfc997"
      );
    }
  }

  // A figura deixa de existir no cenário após a foto.
  if (
    q &&
    q.phase === "camera" &&
    state.room === "village"
  ) {
    rect(491, 139, 18, 36, "#080d12");
    rect(494, 129, 12, 12, "#080d12");
  }

  c.restore();

  if (
    photoScene &&
    photoScene.phase === "fade"
  ) {
    const alpha = Math.max(
      0,
      1 - Math.abs(photoScene.time - 0.4) / 0.4
    );

    rect(
      0, 0, W, H,
      "rgba(0,0,0," + alpha + ")"
    );
  }

  if (
    photoScene &&
    photoScene.phase === "ready"
  ) {
    c.strokeStyle = "#d4d5be";
    c.strokeRect(175, 50, 130, 150);
  }
};

window.addEventListener(
  "keydown",
  event => {
    if (mode !== "game" || !state) return;

    const key = event.key.toLowerCase();

    if (photoScene) {
      event.preventDefault();
      event.stopImmediatePropagation();

      // Exige um novo toque para cada ação.
      if (event.repeat || key !== "e") return;

      if (photoScene.phase === "ready") {
        captureEvidence();
      } else if (photoScene.phase === "review") {
        if (!$("overlay").hidden) {
          $("modalActions")
            .querySelector("button")
            ?.click();
        } else if (dialog) {
          advance();
        }
      }

      return;
    }

    if (
      key === "j" &&
      !event.repeat &&
      !dialog &&
      !transitionBusy &&
      !state.gameOver &&
      $("overlay").hidden
    ) {
      event.preventDefault();
      event.stopImmediatePropagation();

      openJournal();
    }
  },
  true
);

const drawWorldBeforeOpeningStatic = drawWorld;
drawWorld = function () {
  drawWorldBeforeOpeningStatic();
  if (state.stage === "prologue" && elapsed < openingStaticUntil &&
      $("overlay").hidden && Math.floor(elapsed * 8) % 3 === 0) {
    drawStatic(0, W, 10);
  }
};


// =========================================================
// CONTINUAÇÃO 0.6 — ALIMENTAÇÃO, VENDA, CHECKPOINT E SÓTÃO
// Diário visual permanece intocado nesta etapa.
// =========================================================

const v06Base = {
  go,
  getNear,
  interact,
  update,
  updateHud,
  drawWorld
};

roomNames.shop = "Casa da vizinha";

objectives.key = "A reserva ficou onde o tempo parou.";
objectives.supplies = "Bata na casa da vizinha e peça ajuda.";
objectives.return = "Leve a porção para seu irmão.";

// Ajustes de cenário sem reescrever os mapas antigos.
const v06VillageShop = null;

// Relógio parado na sala: nova posição da chave reserva.
if (!maps.living.objects.some(o => o.action === "key")) {
  maps.living.objects.push({
    x: housePoint(455),
    y: housePoint(92),
    w: housePoint(45),
    h: housePoint(55),
    type: "shelf",
    label: "Examinar o relógio parado",
    action: "key"
  });
}

// Bilhete perto da entrada com a dica da chave.
if (!maps.foyer.objects.some(o => o.action === "keyNote")) {
  maps.foyer.objects.push({
    x: housePoint(500),
    y: housePoint(255),
    w: housePoint(55),
    h: housePoint(28),
    type: "table",
    label: "Ler a anotação",
    action: "keyNote"
  });
}

// O primeiro baú do sótão deixa de conter a chave.
// O segundo móvel vira o baú da câmera.
const v06AtticFirstChest = maps.attic.objects.find(o => o.action === "key");
if (v06AtticFirstChest) {
  v06AtticFirstChest.action = "atticFirstChest";
  v06AtticFirstChest.label = "Vasculhar o primeiro baú";
}

const v06CameraChest =
  maps.attic.objects.find(o =>
    o !== v06AtticFirstChest &&
    o.type === "crate"
  );

if (v06CameraChest) {
  v06CameraChest.type = "chest";
  v06CameraChest.cameraChest = true;
}

// Móveis antigos cobertos por lençóis no sótão.
if (!maps.attic.objects.some(o => o.coveredFurniture)) {
  maps.attic.objects.push(
    {
      x: housePoint(225),
      y: housePoint(215),
      w: housePoint(120),
      h: housePoint(55),
      type: "sofa",
      coveredFurniture: true
    },
    {
      x: housePoint(485),
      y: housePoint(245),
      w: housePoint(70),
      h: housePoint(48),
      type: "table",
      coveredFurniture: true
    }
  );
}

const v06FurnishingBase = furnishing;
furnishing = function (o) {
  v06FurnishingBase(o);

  if (!o.coveredFurniture) return;

  rect(
    o.x - 3,
    o.y - 5,
    o.w + 6,
    Math.max(18, o.h * 0.72),
    "#a39c8d"
  );

  rect(
    o.x + 8,
    o.y + 5,
    Math.max(10, o.w - 16),
    2,
    "#c8c1b350"
  );
};

// Interior provisório da delegacia.
roomNames.police = "Delegacia";

if (!maps.police) {
  room(
    "police",
    [
      obj(95, 80, 135, 48, "shelf"),
      obj(235, 105, 230, 58, "counter", "Falar com o policial", "policeOfficer"),
      obj(100, 245, 105, 48, "table"),
      obj(420, 235, 85, 55, "shelf")
    ],
    [
      door(310, 374, "village", 1095, 715, "Sair da delegacia")
    ]
  );
}

// Interior compacto da venda.
if (!maps.shop) {
  room(
    "shop",
    [
      obj(110, 78, 120, 50, "shelf"),
      obj(255, 95, 205, 62, "counter", "Falar com a vizinha", "vendor"),
      obj(95, 220, 85, 55, "crate"),
      obj(440, 230, 75, 50, "crate"),
      obj(250, 230, 120, 58, "table")
    ],
    [
      door(310, 374, "village", 292, 708, "Sair da casa da vizinha")
    ]
  );
}

let v06ToastText = "";
let v06ToastUntil = 0;

function v06Toast(text, seconds = 1.5) {
  v06ToastText = text;
  v06ToastUntil = elapsed + seconds;
}

function v06AbsoluteMinutes() {
  return state.day * 1440 + state.minutes;
}

function v06StockCycle() {
  // O estoque do novo dia só nasce às 07:00.
  return state.day + (state.minutes >= 420 ? 0 : -1);
}

function v06ShopOpen() {
  // Aberta das 06:00 até 01:00, atravessando a meia-noite.
  return state.minutes >= 360 || state.minutes < 60;
}

prepareSystems = function () {
  if (!state) return;

  if (!state.danger) {
    state.danger = {
      phase: "safe",
      time: 0,
      countdown: 60,
      cooldown: 12,
      victories: 0,
      enemy: null,
      punch: 0
    };
  }

  if (!Number.isFinite(state.brotherFood)) {
    state.brotherFood = 75;
  }

  // Compatibilidade com saves anteriores:
  // dormir só é liberado depois da primeira comida dada ao irmão.
  if (typeof state.firstBrotherMealDone !== "boolean") {
    state.firstBrotherMealDone = ![
      "prologue",
      "parents",
      "meal",
      "feed"
    ].includes(state.stage);
  }

  // Marca o último dia em que o irmão recebeu uma porção.
  // Saves antigos ganham tolerância no dia atual para não perderem
  // imediatamente ao carregar a nova versão.
  if (!Number.isFinite(state.lastBrotherFeedDay)) {
    state.lastBrotherFeedDay =
      state.firstBrotherMealDone ? state.day : -1;
  }

  if (typeof state.forcedSleepDue !== "boolean") {
    state.forcedSleepDue = false;
  }

  // Eventos de história e quantas vezes cada assunto já foi relatado
  // na delegacia. Os eventos do idoso e da van serão ativados
  // quando essas sequências forem implementadas.
  if (!state.storyEvents || typeof state.storyEvents !== "object") {
    state.storyEvents = {};
  }

  if (!Number.isFinite(state.storyEvents.oldManEncounters)) {
    state.storyEvents.oldManEncounters = 0;
  }

  if (!Number.isFinite(state.storyEvents.vanSightings)) {
    state.storyEvents.vanSightings = 0;
  }

  if (!state.policeReports || typeof state.policeReports !== "object") {
    state.policeReports = {};
  }

  for (const topic of ["parents", "oldMan", "van"]) {
    if (!Number.isFinite(state.policeReports[topic])) {
      state.policeReports[topic] = 0;
    }
  }

  state.brotherFood = Math.max(
    0,
    Math.min(100, state.brotherFood)
  );

  // Uma única porção pode ser carregada.
  state.food = Math.max(
    0,
    Math.min(1, Number(state.food) || 0)
  );

  const cycle = v06StockCycle();

  if (!Number.isFinite(state.stockCycle)) {
    state.stockCycle = cycle;
    state.stock = Number.isFinite(state.stock)
      ? Math.max(0, Math.min(2, state.stock))
      : 2;
  }

  if (cycle > state.stockCycle) {
    state.stockCycle = cycle;
    state.stock = 2;
  } else if (cycle < state.stockCycle) {
    state.stockCycle = cycle;
  }

  if (!Number.isFinite(state.stock)) {
    state.stock = 2;
  }

  state.stock = Math.max(0, Math.min(2, state.stock));

  if (!Number.isFinite(state.foodClock)) {
    state.foodClock = v06AbsoluteMinutes();
  }

  const atticShouldBeUnlocked = ![
    "prologue",
    "parents",
    "meal",
    "feed",
    "sleep",
    "check",
    "empty",
    "talk"
  ].includes(state.stage);

  if (typeof state.atticUnlocked !== "boolean") {
    state.atticUnlocked = atticShouldBeUnlocked;
  } else if (atticShouldBeUnlocked) {
    state.atticUnlocked = true;
  }

  if (!state._lastRoomV06) {
    state._lastRoomV06 = state.room;
  }
};

function v06FeedBrother() {
  prepareSystems();

  if (state.food <= 0) return false;

  state.food = 0;
  state.brotherFood = Math.min(
    100,
    state.brotherFood + 25
  );
  state.foodClock = v06AbsoluteMinutes();
  state.lastBrotherFeedDay = state.day;

  updateHud();
  save();

  return true;
}

function v06RestoreCheckpoint() {
  if (!state.rescueCheckpoint) return;

  state = JSON.parse(
    JSON.stringify(state.rescueCheckpoint)
  );

  state.gameOver = false;
  delete state.defeatReason;

  prepareSystems();

  // Mantém o mesmo checkpoint disponível para novas tentativas.
  rememberSafePoint();

  closeModal();
  enterGame();
  updateHud();
  save();
}

showDefeat = function () {
  const hunger = state.defeatReason === "hunger";
  const deadline = state.defeatReason === "deadline";

  const buttons = [];

  if (state.rescueCheckpoint) {
    buttons.push([
      "Voltar ao checkpoint",
      v06RestoreCheckpoint
    ]);
  }

  buttons.push([
    "Menu principal",
    () => {
      save();
      closeModal();

      mode = "menu";

      $("menu").hidden = false;
      $("hud").hidden = true;
      $("prompt").hidden = true;
    }
  ]);

  modal(
    hunger
      ? "Seu irmão ficou sem alimento"
      : deadline
        ? "Você deixou o tempo acabar"
        : "Você não chegou a tempo",
    hunger
      ? "A alimentação do seu irmão chegou a 0%."
      : deadline
        ? "Chegou 14:00 e você não tinha uma porção para o seu irmão. Agora está exausto demais para continuar."
        : "O invasor chegou ao seu irmão.",
    buttons
  );
};

function v06TriggerHungerDefeat() {
  if (state.gameOver) return;

  state.brotherFood = 0;
  state.gameOver = true;
  state.defeatReason = "hunger";

  keys.clear();
  save();
  showDefeat();
}

function v06UpdateBrotherFood() {
  prepareSystems();

  const now = v06AbsoluteMinutes();

  // O relógio de alimentação começa a contar de verdade
  // após a primeira saída. Antes disso, os saltos narrativos
  // são tratados pelo sistema de dormir.
  if (!state.firstExit) {
    state.foodClock = now;
    return;
  }

  let delta = now - state.foodClock;

  if (!Number.isFinite(delta) || delta < 0) {
    state.foodClock = now;
    return;
  }

  if (delta <= 0) return;

  state.brotherFood = Math.max(
    0,
    state.brotherFood - delta * (3 / 60)
  );

  state.foodClock = now;

  if (state.brotherFood <= 0) {
    v06TriggerHungerDefeat();
  }
}

function v06Sleep() {
  prepareSystems();

  if (!state.firstBrotherMealDone) {
    say([
      "Ainda não vou dormir. Primeiro preciso levar comida para o meu irmão."
    ]);
    return;
  }

  if (dangerActive()) {
    say([
      "Não posso dormir enquanto alguém está rondando a casa."
    ]);
    return;
  }

  if (state.minutes < 420) {
    say([
      "Ainda não consigo dormir. Preciso esperar passar das 07:00."
    ]);
    return;
  }

  const forced = Boolean(state.forcedSleepDue);
  const minutesToMidnight = 1440 - state.minutes;
  const hours = minutesToMidnight / 60;
  const consumption = hours * 3;
  const after = Math.max(0, state.brotherFood - consumption);

  const sleepNow = () => {
    closeModal();

    fade(
      forced ? "Você não aguenta mais" : "Enquanto você dorme",
      "00:00 · Um novo dia começa.",
      () => {
        state.brotherFood = after;
        state.day += 1;
        state.minutes = 0;
        state.foodClock = v06AbsoluteMinutes();
        state.forcedSleepDue = false;

        if (state.stage === "sleep") {
          state.stage = "check";
        }

        updateHud();

        if (state.brotherFood <= 0) {
          v06TriggerHungerDefeat();
        } else {
          save();
        }
      }
    );
  };

  const buttons = [
    ["Dormir", sleepNow]
  ];

  if (!forced) {
    buttons.push(["Agora não", closeModal]);
  }

  modal(
    forced
      ? "Você precisa dormir"
      : "Dormir até 00:00?",
    "Alimentação atual do irmão: " +
      Math.round(state.brotherFood) +
      "%\nConsumo previsto durante o sono: " +
      consumption.toFixed(1) +
      " pontos\nAo acordar: " +
      Math.round(after) +
      "%" +
      (forced
        ? "\n\nSão 14:00. Você não consegue continuar sem descansar."
        : ""),
    buttons
  );
}

// O checkpoint deixa de ser criado ao iniciar a invasão.
const v06StartInvasionBase = startInvasion;
startInvasion = function () {
  // Replica o início da invasão sem substituir o checkpoint da casa.
  const d = state.danger;

  d.phase = "yellow";
  d.time = 0;
  d.countdown = 60;

  d.enemy = {
    room: "village",
    x: 690,
    y: 740,
    hp: 3,
    flash: 0,
    walk: 0,
    facing: "left",
    path: [
      [500, 740],
      [500, 664]
    ]
  };

  save();
};

go = function (nextRoom, x, y) {
  prepareSystems();

  if (
    nextRoom === "attic" &&
    !state.atticUnlocked
  ) {
    say([
      "Não preciso subir agora."
    ]);
    return;
  }

  v06Base.go(nextRoom, x, y);
};

getNear = function () {
  prepareSystems();

  // Entrada real da venda: somente pela porta frontal.
  if (state.room === "village") {
    const shopDoorDistance = Math.hypot(
      state.x - 202.5,
      state.y - 399
    );

    if (shopDoorDistance < 45) {
      return {
        label: "Entrar na venda",
        action: "shopDoor"
      };
    }
  }

  // O baú da câmera pode ser examinado antes da investigação,
  // mas só pode ser resolvido com as três pistas.
  if (state.room === "attic" && v06CameraChest) {
    const px = Math.max(
      v06CameraChest.x,
      Math.min(
        state.x,
        v06CameraChest.x + v06CameraChest.w
      )
    );

    const py = Math.max(
      v06CameraChest.y,
      Math.min(
        state.y,
        v06CameraChest.y + v06CameraChest.h
      )
    );

    if (Math.hypot(state.x - px, state.y - py) < 44) {
      return {
        label: "Abrir baú da câmera",
        action: "clue:chest"
      };
    }
  }

  const target = v06Base.getNear();

  // Remove de vez a antiga caixa externa de alimento.
  if (
    state.room === "village" &&
    target &&
    (
      target.action === "supply" ||
      target.action === "shopDoor"
    )
  ) {
    return null;
  }

  return target;
};

interact = function (action) {
  prepareSystems();

  const q = chapter();

  if (action === "shopDoor") {
    if (state.stage === "prologue") {
      say([
        ["Pai", "A venda está fechada agora. Precisamos seguir para o portão norte."]
      ]);
      return;
    }

    if (!v06ShopOpen()) {
      say([
        ["Vendedor", "Fechamos à 01:00. Voltamos a abrir às 06:00."]
      ]);
      return;
    }

    go("shop", 310, 330);
    return;
  }

  if (action === "vendor") {
    if (!v06ShopOpen()) {
      say([
        ["Vendedor", "Já encerramos por hoje."]
      ]);
      return;
    }

    if (state.food >= 1) {
      say([
        ["Vendedor", "Você já está carregando uma porção. Leve para quem precisa antes de pegar outra."]
      ]);
      return;
    }

    if (state.stock <= 0) {
      say([
        ["Vendedor", "As duas porções gratuitas de hoje acabaram. O estoque volta às 07:00."]
      ]);
      return;
    }

    const stockCycle = state.stockCycle;

    say(
      [
        ["Vendedor", "Ainda tenho " + state.stock + " porção(ões) gratuita(s) hoje. Pode levar uma."]
      ],
      () => {
        prepareSystems();

        if (
          state.stockCycle !== stockCycle ||
          state.stock <= 0 ||
          state.food >= 1
        ) {
          return;
        }

        state.stock -= 1;
        state.food = 1;

        if (state.stage === "supplies") {
          state.stage = "return";
        }

        updateHud();
        save();
      }
    );

    return;
  }

  if (action === "keyNote") {
    say([
      "A reserva ficou onde o tempo parou."
    ]);
    return;
  }

  if (action === "key") {
    if (state.key) {
      say([
        "O relógio continua parado. O esconderijo está vazio."
      ]);
      return;
    }

    if (state.stage !== "key") {
      say([
        "Um relógio antigo, parado há muito tempo."
      ]);
      return;
    }

    say(
      [
        "Atrás do relógio parado há uma pequena chave presa com fita."
      ],
      () => {
        state.key = true;
        state.stage = "exit";
        updateHud();
        save();
      }
    );

    return;
  }

  if (action === "atticFirstChest") {
    say([
      "Só há tecidos, papéis antigos e objetos quebrados."
    ]);
    return;
  }

  if (action === "bed") {
    v06Sleep();
    return;
  }

  // Salva um checkpoint dentro da casa antes da primeira saída.
  if (
    action === "outside" &&
    state.room === "foyer" &&
    state.key &&
    !state.firstExit
  ) {
    rememberSafePoint();
  }

  // Alimentação do irmão: +25 por porção, até 100%.
  if (
    action === "brother" &&
    q &&
    q.phase === "brother"
  ) {
    return v06Base.interact(action);
  }

  if (
    action === "brother" &&
    state.stage === "feed" &&
    state.food > 0
  ) {
    say(
      [
        ["Irmão", "Estou com um mau pressentimento. Eles nunca demoram assim."],
        ["Você", "Come um pouco. Eu vou continuar procurando."]
      ],
      () => {
        v06FeedBrother();
        state.firstBrotherMealDone = true;
        state.stage = "sleep";
        updateHud();
        save();
      }
    );
    return;
  }

  if (
    action === "brother" &&
    (
      state.stage === "return" ||
      state.stage === "free"
    ) &&
    state.food > 0
  ) {
    const firstDelivery = !state.finished;

    say(
      firstDelivery
        ? [
            ["Irmão", "Alguém ficou olhando para a janela enquanto você estava fora."],
            ["Você", "Trouxe comida. Vou conferir a entrada."]
          ]
        : [
            ["Irmão", "Obrigado. Eu estava começando a ficar com fome."]
          ],
      () => {
        v06FeedBrother();

        if (firstDelivery) {
          state.finished = true;
          state.stage = "free";
          updateHud();
          save();
        }
      }
    );
    return;
  }

  // Coleta das três pistas sem diálogo: salva imediatamente
  // e exibe apenas um aviso curto.
  if (
    action.startsWith("clue:") &&
    !["clue:chest", "clue:normal"].includes(action)
  ) {
    const id = action.slice(5);

    if (!q.clues.includes(id)) {
      q.clues.push(id);

      if (
        q.clues.length >= 3 &&
        q.phase === "clues"
      ) {
        q.phase = "chest";
      }

      v06Toast("Pista coletada");
      updateHud();
      save();
    } else {
      v06Toast("Pista já coletada");
    }

    return;
  }

  if (action === "clue:chest") {
    if (q.camera) {
      say([
        "O segundo baú está vazio. A câmera está comigo."
      ]);
      return;
    }

    if (
      q.phase === "waiting" ||
      q.phase === "brother"
    ) {
      say([
        "Não sei o que esses símbolos significam. Melhor voltar aqui mais tarde."
      ]);
      return;
    }

    if (q.clues.length < 3) {
      say([
        "Ainda faltam pistas para entender a sequência dos símbolos."
      ]);
      return;
    }

    chestPuzzle();
    return;
  }

  v06Base.interact(action);
};

updateHud = function () {
  prepareSystems();
  v06Base.updateHud();

  if (!state) return;

  $("inventory").textContent =
    "PORÇÃO " +
    state.food +
    "/1 · ALIMENTAÇÃO " +
    Math.round(state.brotherFood) +
    "% · VENDA " +
    state.stock +
    "/2" +
    (state.key ? " · CHAVE RESERVA" : "");

  if (
    state.investigation &&
    !dangerActive()
  ) {
    const q = state.investigation;

    if (q.phase === "clues") {
      $("objective").textContent =
        "Investigue o quarto dos pais: " +
        q.clues.length +
        "/3 pistas.";
    } else if (q.phase === "chest") {
      $("objective").textContent =
        "Volte ao sótão e abra o segundo baú.";
    } else if (q.phase === "camera") {
      $("objective").textContent =
        "Fotografe a figura perto do portão norte.";
    } else if (q.phase === "done") {
      $("objective").textContent =
        "A fotografia aponta para o oeste.";
    }
  }
};

update = function (dt) {
  prepareSystems();

  const beforeRoom = state ? state.room : null;

  v06Base.update(dt);

  if (!state) return;

  prepareSystems();

  // Detecta entrada efetiva em casa após a transição e atualiza
  // o checkpoint somente nesse momento.
  if (state._lastRoomV06 !== state.room) {
    const previousRoom = state._lastRoomV06;
    state._lastRoomV06 = state.room;

    if (
      previousRoom === "village" &&
      state.room === "foyer" &&
      !state.gameOver
    ) {
      rememberSafePoint();
      save();
    }
  }

  if (
    mode !== "game" ||
    dialog ||
    transitionBusy ||
    !$("overlay").hidden ||
    state.gameOver
  ) {
    return;
  }

  v06UpdateBrotherFood();
  prepareSystems();
  updateHud();
};

drawWorld = function () {
  prepareSystems();

  // Esconde a barra horizontal antiga e o retângulo de enquadramento
  // da fotografia sem alterar o restante da renderização existente.
  const finished = state.finished;
  const photoPhase = photoScene ? photoScene.phase : null;

  state.finished = false;

  if (photoScene && photoScene.phase === "ready") {
    photoScene.phase = "ready-no-frame";
  }

  v06Base.drawWorld();

  state.finished = finished;

  if (photoScene && photoPhase !== null) {
    photoScene.phase = photoPhase;
  }

  // Vendedor no interior da venda.
  if (state.room === "shop") {
    c.save();
    c.translate(
      -Math.floor(camera.x),
      -Math.floor(camera.y)
    );

    person(
      housePoint(355),
      housePoint(128),
      "npcMale",
      0,
      "down",
      0.9
    );

    txt(
      "VENDEDOR",
      housePoint(326),
      housePoint(82),
      "#d7c49b",
      7
    );

    c.restore();
  }

  if (state.stage !== "prologue") {
    const d = state.danger;

    const dangerStyles = {
      safe: ["#7caf8b", 0.06],
      yellow: ["#d5c264", 0.32],
      orange: ["#dc964e", 0.60],
      red: ["#d26b62", 0.84],
      critical: ["#e55757", 1],
      lost: ["#bd4848", 1]
    };

    const dangerData =
      dangerStyles[d.phase] ||
      dangerStyles.safe;

    const dangerColor = dangerData[0];
    const dangerFill = dangerData[1];

    // PERIGO — vertical à esquerda.
    const dangerX = 10;
    const dangerY = 65;
    const barH = 138;
    const barW = 12;

    rect(
      dangerX - 5,
      dangerY - 24,
      52,
      barH + 34,
      "#09121adb"
    );

    txt(
      "PERIGO",
      dangerX - 2,
      dangerY - 10,
      "#c8c5b5",
      7
    );

    rect(
      dangerX,
      dangerY,
      barW,
      barH,
      "#30383c"
    );

    rect(
      dangerX,
      dangerY + barH - Math.round(barH * dangerFill),
      barW,
      Math.round(barH * dangerFill),
      dangerColor
    );

    if (d.phase === "critical") {
      txt(
        Math.ceil(d.countdown) + "s",
        dangerX + 18,
        dangerY + 10,
        dangerColor,
        8
      );
    }

    // ALIMENTAÇÃO — vertical à direita.
    const foodX = W - 22;
    const foodY = 65;
    const foodFill = state.brotherFood / 100;
    const foodColor =
      state.brotherFood > 55
        ? "#7caf8b"
        : state.brotherFood > 25
          ? "#d5a458"
          : "#d25f58";

    rect(
      foodX - 32,
      foodY - 24,
      49,
      barH + 34,
      "#09121adb"
    );

    txt(
      "COMIDA",
      foodX - 30,
      foodY - 10,
      "#c8c5b5",
      7
    );

    rect(
      foodX,
      foodY,
      barW,
      barH,
      "#30383c"
    );

    rect(
      foodX,
      foodY + barH - Math.round(barH * foodFill),
      barW,
      Math.round(barH * foodFill),
      foodColor
    );

    txt(
      Math.round(state.brotherFood) + "%",
      foodX - 30,
      foodY + barH + 14,
      foodColor,
      7
    );
  }

  if (
    v06ToastText &&
    elapsed < v06ToastUntil
  ) {
    const w = Math.max(
      100,
      v06ToastText.length * 7 + 18
    );

    rect(
      W / 2 - w / 2,
      H - 58,
      w,
      24,
      "#0b131beb"
    );

    txt(
      v06ToastText,
      W / 2 - w / 2 + 9,
      H - 42,
      "#e3d3ac",
      8
    );
  }

  // A estática permanece pulsando durante toda a conversa
  // inicial com os filhos, sem bloquear controles ou diálogo.
  if (
    state.stage === "prologue" &&
    dialog &&
    !state.familyFarewell &&
    Math.floor(elapsed * 10) % 4 === 0
  ) {
    drawStatic(0, W, 7);
  }
};

$("help").onclick = () => modal(
  "Como jogar",
  "WASD / setas: andar. Shift: correr. E: interagir. Esc: pausar. ESPAÇO: soco perto do invasor.\n\nA barra PERIGO fica à esquerda. A ALIMENTAÇÃO do irmão fica à direita: começa em 75%, perde 3 pontos por hora do jogo e cada porção recupera 25 pontos, até 100%.\n\nVocê carrega no máximo uma porção. A venda abre às 06:00, fecha à 01:00 e oferece duas porções gratuitas por ciclo, com reposição às 07:00.\n\nDepois das 07:00, a cama permite dormir até 00:00 do dia seguinte, desde que não exista uma invasão ativa. O consumo previsto de alimentação é mostrado antes de confirmar.",
  [["Voltar", closeModal]]
);

// CONTINUAÇÃO 0.6.1 — FONTES EXTRAS E MISSÃO DO OESTE
// Sem expandir a região oeste nem a história principal.
// =========================================================

const v061Base = {
  getNear,
  interact,
  updateHud,
  drawWorld
};

const v061PrepareBase = prepareSystems;
prepareSystems = function () {
  v061PrepareBase();

  if (!state) return;

  if (!state.westMission) {
    state.westMission = {
      status: "waiting",
      targetHp: 3
    };
  }

  if (typeof state.westUnlocked !== "boolean") {
    state.westUnlocked = false;
  }
};

const V061_GARDEN = { x: 820, y: 515 };
const V061_ORCHARD = { x: 125, y: 505 };
const V061_INFORMANT = { x: 325, y: 470 };
const V061_TARGET = { x: 805, y: 470 };
const V061_WEST_PATH = { x: 38, y: 401 };

function v061TakeFood(sourceKey, label) {
  prepareSystems();

  if (state.food >= 1) {
    say([
      "Já estou carregando uma porção. Preciso alimentar meu irmão primeiro."
    ]);
    return;
  }

  const cycle = v06StockCycle();

  if (state[sourceKey] === cycle) {
    say([
      "Não há mais nada útil aqui por enquanto."
    ]);
    return;
  }

  state[sourceKey] = cycle;
  state.food = 1;

  v06Toast(label + ": porção coletada");
  updateHud();
  save();
}

function v061OfferWestMission() {
  const mission = state.westMission;

  if (mission.status === "waiting") {
    modal(
      "Uma proposta",
      "O homem diz que sabe algo sobre seus pais. Em troca da informação e da passagem para o oeste, ele quer que você mate o homem de casaco claro que permanece no lado leste da vila.",
      [
        [
          "Aceitar",
          () => {
            closeModal();
            mission.status = "accepted";
            mission.targetHp = 3;
            updateHud();
            save();

            say([
              ["Homem", "Volte quando ele não puder mais me atrapalhar."]
            ]);
          }
        ],
        ["Recusar por enquanto", closeModal]
      ]
    );
    return;
  }

  if (mission.status === "accepted") {
    say([
      ["Homem", "O acordo ainda está de pé. Ele fica no lado leste da vila."]
    ]);
    return;
  }

  if (mission.status === "target_down") {
    say(
      [
        ["Homem", "Então terminou."],
        ["Homem", "Vi seus pais seguirem para oeste com alguém que não reconheci."],
        ["Homem", "A passagem está livre agora. O resto você terá de descobrir sozinho."]
      ],
      () => {
        mission.status = "done";
        state.westUnlocked = true;
        updateHud();
        save();
      }
    );
    return;
  }

  say([
    ["Homem", "O caminho oeste está aberto. Não tenho mais nada para você."]
  ]);
}

getNear = function () {
  prepareSystems();

  if (state.room === "village" && state.finished) {
    if (
      Math.hypot(
        state.x - V061_GARDEN.x,
        state.y - V061_GARDEN.y
      ) < 42
    ) {
      return {
        label: "Colher legumes",
        action: "food:garden"
      };
    }

    if (
      Math.hypot(
        state.x - V061_ORCHARD.x,
        state.y - V061_ORCHARD.y
      ) < 42
    ) {
      return {
        label: "Procurar frutas",
        action: "food:orchard"
      };
    }
  }

  const q = chapter();

  if (
    state.room === "village" &&
    q &&
    q.phase === "done"
  ) {
    if (
      Math.hypot(
        state.x - V061_INFORMANT.x,
        state.y - V061_INFORMANT.y
      ) < 44
    ) {
      return {
        label: "Falar com o homem",
        action: "westInformant"
      };
    }

    if (
      Math.hypot(
        state.x - V061_WEST_PATH.x,
        state.y - V061_WEST_PATH.y
      ) < 48
    ) {
      return {
        label: state.westUnlocked
          ? "Seguir para oeste"
          : "Examinar caminho oeste",
        action: "westPath"
      };
    }
  }

  return v061Base.getNear();
};

interact = function (action) {
  prepareSystems();

  if (action === "food:garden") {
    v061TakeFood(
      "gardenFoodCycle",
      "Horta"
    );
    return;
  }

  if (action === "food:orchard") {
    v061TakeFood(
      "orchardFoodCycle",
      "Pomar"
    );
    return;
  }

  if (action === "westInformant") {
    v061OfferWestMission();
    return;
  }

  if (action === "westPath") {
    if (!state.westUnlocked) {
      say([
        "A passagem para oeste está bloqueada. O homem perto da estrada parece saber alguma coisa."
      ]);
    } else {
      say([
        "O caminho para oeste está livre. A região além daqui será construída na próxima etapa."
      ]);
    }
    return;
  }

  v061Base.interact(action);
};

const v061PunchBase = punchInvader;
punchInvader = function () {
  prepareSystems();

  const e = state.danger && state.danger.enemy;

  if (
    e &&
    e.room === state.room &&
    Math.hypot(e.x - state.x, e.y - state.y) <= 44
  ) {
    v061PunchBase();
    return;
  }

  const mission = state.westMission;

  if (
    state.room === "village" &&
    mission.status === "accepted" &&
    mission.targetHp > 0 &&
    Math.hypot(
      state.x - V061_TARGET.x,
      state.y - V061_TARGET.y
    ) <= 44
  ) {
    state.danger.punch = 0.45;
    mission.targetHp -= 1;

    if (mission.targetHp <= 0) {
      mission.targetHp = 0;
      mission.status = "target_down";
      v06Toast("Alvo derrotado");
      updateHud();
    }

    save();
    return;
  }

  v061PunchBase();
};

updateHud = function () {
  prepareSystems();
  v061Base.updateHud();

  const q = chapter();

  if (
    !q ||
    q.phase !== "done" ||
    dangerActive()
  ) {
    return;
  }

  const mission = state.westMission;

  if (mission.status === "waiting") {
    $("objective").textContent =
      "A fotografia aponta para oeste. Procure alguém que conheça a região.";
  } else if (mission.status === "accepted") {
    $("objective").textContent =
      "Encontre o homem de casaco claro no lado leste da vila.";
  } else if (mission.status === "target_down") {
    $("objective").textContent =
      "Volte ao informante perto do caminho oeste.";
  } else if (mission.status === "done") {
    $("objective").textContent =
      "O caminho oeste foi liberado.";
  }
};

drawWorld = function () {
  v061Base.drawWorld();
  prepareSystems();

  if (
    state.room !== "village" ||
    !state.finished
  ) {
    return;
  }

  c.save();
  c.translate(
    -Math.floor(camera.x),
    -Math.floor(camera.y)
  );

  // Horta simples — fonte extra de uma porção por ciclo.
  rect(
    V061_GARDEN.x - 34,
    V061_GARDEN.y - 20,
    68,
    40,
    "#4b3b2d"
  );

  for (let i = -24; i <= 24; i += 12) {
    rect(
      V061_GARDEN.x + i,
      V061_GARDEN.y - 12,
      5,
      24,
      "#567a47"
    );
  }

  // Pomar simples — segunda fonte extra.
  rect(
    V061_ORCHARD.x - 4,
    V061_ORCHARD.y - 2,
    8,
    32,
    "#4b3d2e"
  );

  rect(
    V061_ORCHARD.x - 23,
    V061_ORCHARD.y - 28,
    46,
    31,
    "#31543c"
  );

  const q = chapter();

  if (q && q.phase === "done") {
    person(
      V061_INFORMANT.x,
      V061_INFORMANT.y,
      "npcMale",
      0,
      "left",
      0.9
    );

    rect(
      V061_INFORMANT.x - 8,
      V061_INFORMANT.y - 27,
      16,
      18,
      "#34323b"
    );

    txt(
      "HOMEM",
      V061_INFORMANT.x - 18,
      V061_INFORMANT.y - 34,
      "#c9b69a",
      7
    );

    if (
      state.westMission.status === "accepted" &&
      state.westMission.targetHp > 0
    ) {
      person(
        V061_TARGET.x,
        V061_TARGET.y,
        "npcMale",
        0,
        "right",
        0.9
      );

      rect(
        V061_TARGET.x - 8,
        V061_TARGET.y - 26,
        16,
        18,
        "#c3b79d"
      );

      for (let i = 0; i < 3; i++) {
        rect(
          V061_TARGET.x - 10 + i * 8,
          V061_TARGET.y - 42,
          5,
          3,
          i < state.westMission.targetHp
            ? "#cf7160"
            : "#39343b"
        );
      }

      txt(
        "ESPAÇO",
        V061_TARGET.x - 20,
        V061_TARGET.y - 48,
        "#e5cda8",
        7
      );
    }

    if (state.westUnlocked) {
      txt(
        "OESTE LIBERADO",
        52,
        386,
        "#d7c895",
        8
      );
    }
  }

  c.restore();
};

// =========================================================
// 0.6.26 — CICLO DE DIA/NOITE E SONO OBRIGATÓRIO ÀS 14:00
// =========================================================

const v0626Base = {
  interact,
  update,
  updateHud
};

function v0626TriggerDeadlineDefeat() {
  if (!state || state.gameOver) return;

  state.gameOver = true;
  state.defeatReason = "deadline";
  state.minutes = 840;
  keys.clear();
  save();
  showDefeat();
}

interact = function (action) {
  prepareSystems();

  if (state && state.forcedSleepDue) {
    const canNavigateHome = [
      "home",
      "up",
      "down",
      "bed"
    ].includes(action);

    const canFeedCarriedFood =
      action === "brother" &&
      state.food > 0 &&
      state.lastBrotherFeedDay !== state.day;

    if (!canNavigateHome && !canFeedCarriedFood) {
      say([
        state.lastBrotherFeedDay === state.day
          ? "Não consigo fazer isso agora. Preciso voltar para a cama e dormir."
          : "Não consigo fazer isso agora. Preciso levar esta comida ao meu irmão e dormir."
      ]);
      return;
    }
  }

  v0626Base.interact(action);
};

updateHud = function () {
  v0626Base.updateHud();

  if (!state || !state.firstExit) return;

  if (state.forcedSleepDue) {
    $("objective").textContent =
      state.lastBrotherFeedDay === state.day
        ? "São 14:00. Volte para sua cama e durma."
        : state.food > 0
          ? "São 14:00. Leve a comida ao seu irmão e depois durma."
          : "São 14:00. Você deixou a rotina para tarde demais.";

    $("timeNote").textContent =
      "14:00 · TEMPO PARADO · DURMA";
  } else if (state.minutes >= 360) {
    $("timeNote").textContent =
      "DIA · TEMPO 2× · 1 HORA = 00:40";
  } else {
    $("timeNote").textContent =
      "NOITE · 1 HORA = 01:20";
  }
};

update = function (dt) {
  v0626Base.update(dt);

  if (
    !state ||
    mode !== "game" ||
    dialog ||
    transitionBusy ||
    !$("overlay").hidden ||
    state.gameOver ||
    !state.firstExit
  ) {
    return;
  }

  if (state.minutes < 840) {
    return;
  }

  state.minutes = 840;

  // Se chegou 14:00 sem já ter alimentado o irmão hoje,
  // ainda existe uma última chance SOMENTE se a porção já estiver
  // no inventário. Se nem buscou a comida, o dia foi perdido.
  if (
    state.lastBrotherFeedDay !== state.day &&
    state.food <= 0
  ) {
    v0626TriggerDeadlineDefeat();
    return;
  }

  if (!state.forcedSleepDue) {
    state.forcedSleepDue = true;
    keys.clear();
    updateHud();
    save();

    say([
      state.lastBrotherFeedDay === state.day
        ? "Já são 14:00. Estou exausto. Preciso voltar para o meu quarto e dormir."
        : "Já são 14:00. Eu trouxe comida, mas preciso entregar ao meu irmão e ir dormir agora."
    ]);
  }
};

// =========================================================
// 0.6.28 — CONTROLES MOBILE DE TESTE
// =========================================================

const mobileControls = $("mobileControls");
const mobilePointerKeys = new Map();

function mobileControlsAvailable() {
  return Boolean(
    mobileControls &&
    window.matchMedia &&
    window.matchMedia("(hover: none) and (pointer: coarse)").matches
  );
}

function refreshMobileControls() {
  if (!mobileControls) return;

  const active =
    mobileControlsAvailable() &&
    mode === "game" &&
    state &&
    !state.gameOver &&
    $("overlay").hidden &&
    !transitionBusy;

  mobileControls.classList.toggle("mobile-active", Boolean(active));
}

function releaseMobilePointer(pointerId) {
  const held = mobilePointerKeys.get(pointerId);
  if (!held) return;

  keys.delete(held.key);
  held.button.classList.remove("is-pressed");
  mobilePointerKeys.delete(pointerId);
}

function mobileTapKey(key, code = "") {
  if (
    mode !== "game" ||
    !state ||
    transitionBusy ||
    !$("overlay").hidden
  ) {
    return;
  }

  window.dispatchEvent(
    new KeyboardEvent("keydown", {
      key,
      code,
      bubbles: true,
      cancelable: true
    })
  );

  window.dispatchEvent(
    new KeyboardEvent("keyup", {
      key,
      code,
      bubbles: true,
      cancelable: true
    })
  );
}

if (mobileControls) {
  mobileControls.addEventListener("contextmenu", event => {
    event.preventDefault();
  });

  for (const button of mobileControls.querySelectorAll("[data-hold-key]")) {
    const key = button.dataset.holdKey;

    button.addEventListener("pointerdown", event => {
      event.preventDefault();

      if (
        mode !== "game" ||
        !state ||
        dialog ||
        transitionBusy ||
        !$("overlay").hidden
      ) {
        return;
      }

      try {
        button.setPointerCapture(event.pointerId);
      } catch {}

      keys.add(key);
      button.classList.add("is-pressed");
      mobilePointerKeys.set(event.pointerId, { key, button });
    });

    for (const type of ["pointerup", "pointercancel", "lostpointercapture"]) {
      button.addEventListener(type, event => {
        event.preventDefault();
        releaseMobilePointer(event.pointerId);
      });
    }
  }

  for (const button of mobileControls.querySelectorAll("[data-tap-key]")) {
    button.addEventListener("pointerdown", event => {
      event.preventDefault();
      button.classList.add("is-pressed");

      mobileTapKey(
        button.dataset.tapKey,
        button.dataset.tapCode || ""
      );
    });

    for (const type of ["pointerup", "pointercancel", "pointerleave"]) {
      button.addEventListener(type, event => {
        event.preventDefault();
        button.classList.remove("is-pressed");
      });
    }
  }

  window.addEventListener("blur", () => {
    for (const pointerId of [...mobilePointerKeys.keys()]) {
      releaseMobilePointer(pointerId);
    }
  });

  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) return;

    for (const pointerId of [...mobilePointerKeys.keys()]) {
      releaseMobilePointer(pointerId);
    }
  });
}

// Mantém a visibilidade sincronizada com jogo/menu/pausa/transições.
const mobileUpdateBase = update;
update = function(dt) {
  refreshMobileControls();
  mobileUpdateBase(dt);
  refreshMobileControls();
};

// =========================================================
// 0.6.29 — PRIMEIRO BAIRRO E NOVA BASE DA HISTÓRIA
// =========================================================

const v0629Base = {
  getNear,
  interact,
  updateHud
};

function v0629DistanceToObject(o) {
  const px = Math.max(o.x, Math.min(state.x, o.x + o.w));
  const py = Math.max(o.y, Math.min(state.y, o.y + o.h));
  return Math.hypot(state.x - px, state.y - py);
}

getNear = function () {
  if (state?.room === "village") {
    const special = maps.village.objects
      .filter(o => [
        "neighborDoor",
        "marketDoor",
        "yardBasement",
        "westBarrier",
        "eastBarrier",
        "policeDoor"
      ].includes(o.action))
      .map(o => ({ ...o, dist: v0629DistanceToObject(o) }))
      .filter(o => o.dist < 48)
      .sort((a, b) => a.dist - b.dist)[0];

    if (special) return special;
  }

  return v0629Base.getNear();
};

function v0630PoliceParents() {
  const count = state.policeReports.parents++;

  const lines =
    count === 0
      ? [
          ["Policial", "Certo. Desde quando seus pais estão desaparecidos?"],
          ["Você", "Eles foram ao mercado e não voltaram."],
          ["Policial", "Vou registrar. Se soubermos de alguma coisa, avisamos."]
        ]
      : count === 1
        ? [
            ["Você", "Eles ainda não voltaram."],
            ["Policial", "Eu lembro do seu relato."],
            ["Policial", "Já perguntamos na região do mercado. Até agora não surgiu nada que ajude."]
          ]
        : [
            ["Você", "Ainda não encontraram meus pais?"],
            ["Policial", "Não. O caso continua registrado."],
            ["Policial", "Se aparecer alguma informação concreta, vamos verificar."]
          ];

  say(lines, save);
}

function v0630PoliceOldMan() {
  const count = state.policeReports.oldMan++;

  const lines =
    count === 0
      ? [
          ["Você", "Tinha um homem idoso me perseguindo."],
          ["Policial", "O senhor que mora no fim da estrada de terra?"],
          ["Você", "Ele me chamou para entrar e depois veio atrás de mim."],
          ["Policial", "Vamos anotar. Por enquanto, não volte lá sozinho."]
        ]
      : count === 1
        ? [
            ["Você", "Estou falando daquele idoso de novo."],
            ["Policial", "Nós sabemos quem ele é."],
            ["Policial", "Ele vive naquela casa há muito tempo. Ainda não temos nada que justifique uma abordagem."]
          ]
        : [
            ["Você", "Ele continua me preocupando."],
            ["Policial", "Entendi."],
            ["Policial", "Evite aquela estrada. Se houver algo verificável, nós iremos até lá."]
          ];

  say(lines, save);
}

function v0630PoliceVan() {
  const count = state.policeReports.van++;

  const lines =
    count === 0
      ? [
          ["Você", "Tinha uma van estranha parada na minha rua."],
          ["Policial", "Você conseguiu ver a placa ou quem estava dentro?"],
          ["Você", "Não. Ela ficou perto da minha casa por um tempo."],
          ["Policial", "Se aparecer de novo, entre em casa e não se aproxime."]
        ]
      : count === 1
        ? [
            ["Você", "A van apareceu de novo."],
            ["Policial", "A mesma van?"],
            ["Você", "Tenho quase certeza."],
            ["Policial", "Certo. Vou pedir para verificarem essa descrição."]
          ]
        : [
            ["Você", "E aquela van?"],
            ["Policial", "Averiguamos aquela van."],
            ["Policial", "Eles disseram que estavam procurando um mercado e que não apareceriam mais por aqui."],
            ["Você", "E vocês acreditaram?"],
            ["Policial", "Não há nenhuma ocorrência registrada contra eles. Por enquanto, é só isso que temos."]
          ];

  say(lines, save);
}

function v0630OpenPoliceTopics() {
  prepareSystems();

  const buttons = [];

  buttons.push([
    "Falar dos pais",
    () => {
      closeModal();
      v0630PoliceParents();
    }
  ]);

  if (state.storyEvents.oldManEncounters > 0) {
    buttons.push([
      "Falar do idoso",
      () => {
        closeModal();
        v0630PoliceOldMan();
      }
    ]);
  }

  if (state.storyEvents.vanSightings > 0) {
    buttons.push([
      "Falar da van",
      () => {
        closeModal();
        v0630PoliceVan();
      }
    ]);
  }

  buttons.push(["Sair", closeModal]);

  modal(
    "O que aconteceu?",
    "O policial espera você explicar o motivo da visita.",
    buttons
  );
}

interact = function (action) {
  prepareSystems();

  if (action === "policeDoor") {
    if (state.stage === "prologue") {
      say([
        ["Pai", "Não precisamos passar na delegacia agora. O mercado fica mais adiante."]
      ]);
      return;
    }

    go("police", 310, 330);
    return;
  }

  if (action === "policeOfficer") {
    v0630OpenPoliceTopics();
    return;
  }

  if (action === "neighborDoor") {
    if (state.stage === "prologue") {
      say([
        ["Pai", "Não precisamos incomodar a vizinha. O mercado fica algumas quadras acima."]
      ]);
      return;
    }

    go("shop", 310, 330);
    return;
  }

  if (action === "vendor") {
    if (state.food >= 1) {
      say([
        ["Vizinha", "Você já está levando comida. Vá para casa antes que fique mais tarde."]
      ]);
      return;
    }

    if (state.stock <= 0) {
      say([
        ["Vizinha", "Eu queria ajudar mais, mas também estou com pouca coisa em casa."]
      ]);
      return;
    }

    const stockCycle = state.stockCycle;

    say(
      [
        ["Vizinha", "Seus pais ainda não voltaram?"],
        ["Você", "Eles foram ao mercado e não apareceram mais."],
        ["Vizinha", "Leve isto para o seu irmão. Não é muito, mas deve ajudar."],
        ["Vizinha", "E não fique andando sozinho pela rua por muito tempo."]
      ],
      () => {
        prepareSystems();

        if (
          state.stockCycle !== stockCycle ||
          state.stock <= 0 ||
          state.food >= 1
        ) {
          return;
        }

        state.stock -= 1;
        state.food = 1;

        if (state.stage === "supplies") {
          state.stage = "return";
        }

        updateHud();
        save();
      }
    );

    return;
  }

  if (action === "marketDoor") {
    if (state.stage === "prologue") {
      say(
        [
          ["Mãe", "É aqui. Vou pegar a lista."],
          ["Pai", "Não deve demorar."]
        ],
        () => fade(
          "Horas depois",
          "23:00 · Seus pais ainda não voltaram.",
          () => {
            state.minutes = 1380;
            stage("parents");
            go("bedroom", 180, 235);
          }
        )
      );
      return;
    }

    if (["supplies", "return"].includes(state.stage)) {
      say([
        "O mercado está fechado.",
        "Meus pais vieram para cá. Mas agora preciso levar comida para o meu irmão."
      ]);
      return;
    }

    say([
      "Portas fechadas. Luzes apagadas.",
      "Se meus pais chegaram até aqui, não há nenhum sinal deles agora."
    ]);
    return;
  }

  if (action === "yardBasement") {
    say([
      "A entrada do porão fica no quintal. Está trancada.",
      "Meus pais nunca deixavam essa porta aberta."
    ]);
    return;
  }

  if (action === "westBarrier") {
    say([
      "A passagem oeste está presa por uma corrente velha.",
      "Com alguma ferramenta eu provavelmente conseguiria abrir caminho."
    ]);
    return;
  }

  if (action === "eastBarrier") {
    say([
      "A rua leste desaparece entre árvores e casas sem iluminação.",
      "Sem uma lanterna eu não vou entrar ali."
    ]);
    return;
  }

  v0629Base.interact(action);
};

updateHud = function () {
  v0629Base.updateHud();

  if (!state) return;

  if (state.stage === "prologue" && state.room === "village") {
    $("objective").textContent =
      "Siga pela rua principal até o mercado.";
  } else if (state.stage === "supplies") {
    $("objective").textContent =
      "Bata na casa da vizinha e peça algo para seu irmão.";
  } else if (state.stage === "return") {
    $("objective").textContent =
      "Volte para casa e leve a comida ao seu irmão.";
  }
};

// 0.6.18 — Uma referência para proporção visual e colisão do quarto.
const roomItems = {
  // Cama preservada da 0.6.22.
  bed: [255, 97, 96, 124, .14, .26, .72, .62],

  // Tapete DEITADO, parcialmente sob a metade inferior/esquerda da cama.
 rug: [212, 236, 182, 132],

  // Criado-mudo / luminária.
nightstand: [354, 108, 40, 44, .14, .48, .72, .44],
  lampOff: [360, 85, 28, 39],
  lampOn: [360, 85, 28, 39],

  // Estante.
  shelf: [438, 78, 84, 102, .12, .70, .76, .24],

  // Escrivaninha maior e mais baixa: os pés chegam ao piso junto da parede.
desk: [536, 172, 48, 146, .32, .18, .58, .74],

  // Mochila junto à parede superior.
  backpack: [216, 101, 24, 28, .18, .58, .64, .30],

  // Chinelo perto do pé da cama.
  flipflops: [365, 248, 28, 20, .18, .34, .64, .42],

  // Lixeira junto da escrivaninha.
  trash: [492, 296, 28, 34, .18, .56, .64, .34],

  // Tênis perto da porta superior esquerda.
  shoes: [125, 128, 34, 24, .14, .34, .72, .46],

  // Roupa no canto inferior esquerdo, ainda sobre o piso.
  clothes: [70, 275, 58, 40, .16, .38, .68, .42]
};
function roomItemBounds(key) {
  const [x,y,w,h] = roomItems[key].map(housePoint);
  const image = playerRoomSprites[key];
  const crop = spriteReady(image) ? getSpriteCrop(image) : {w,h};
  const sourceW = crop.w;
  const sourceH = crop.h;
  const scale = Math.min(w/sourceW,h/sourceH);
  const width = sourceW*scale, height = sourceH*scale;

  // Móveis de parede e mochila ficam alinhados pelo topo visível.
  const wallAligned = ["bed","shelf","nightstand","lampOff","lampOn","backpack"].includes(key);

  return {
    x: key === "desk" ? x+w-width : x+(w-width)/2,
    y: wallAligned ? y : y+h-height,
    w: width,
    h: height
  };
}
function drawRoomItem(key) {
  const b = roomItemBounds(key);
  drawSpriteContain(playerRoomSprites[key],b.x,b.y,b.w,b.h);
}
function roomCollision(o) {
  const key = o.roomItem || {
    playerBed:"bed",
    playerShelf:"shelf",
    playerDesk:"desk",
    playerNightstand:"nightstand"
  }[o.type];

  if (!key) return o;

  const b = roomItemBounds(key);
  const spec = roomItems[key];

  const hit = {
    ...o,
    x: b.x + b.w * spec[4],
    y: b.y + b.h * spec[5],
    w: b.w * spec[6],
    h: b.h * spec[7]
  };

  // Móveis encostados na parede de cima não deixam corredor invisível atrás.
  // O início da colisão coincide com a linha real piso/parede (y = 78).
  if (["bed","shelf","nightstand","backpack"].includes(key)) {
    const bottom = hit.y + hit.h;
    hit.y = Math.min(b.y, housePoint(78));
    hit.h = bottom - hit.y;
  }

  // A escrivaninha encosta na parede direita: elimina o vão lateral invisível.
  if (key === "desk") {
    const right = housePoint(580);
    hit.w = Math.max(hit.w, right - hit.x);
  }

  return hit;
}
// O tapete é atravessável; objetos soltos usam a base visível como colisão.
maps.bedroom.objects = maps.bedroom.objects.filter(o =>
  o.type !== "playerClutterBlock" && o.type !== "playerBlock");
// Contorno interno medido na arte paredes-player.png (640 × 420 no mapa).
// O corredor da porta fica entre x=101 e x=162.
for (const [x,y,w,h] of [
  // laterais
  [0, 0, 60, 420],
  [580, 0, 60, 420],

  // parede de cima com UMA entrada só (superior esquerda)
  [60, 0, 52, 78],
  [172, 0, 408, 78],
  [112, 0, 60, 18],

  // reforço ao redor da entrada para limpar o recorte do canvas
  [96, 18, 16, 58],
  [172, 18, 14, 58],

  // A parede inferior NÃO bloqueia mais o jogador.
  // Ela é redesenhada em primeiro plano para o player passar por baixo.
]) {
  maps.bedroom.objects.push({
    type:"playerBlock", x:housePoint(x), y:housePoint(y),
    w:housePoint(w), h:housePoint(h)
  });
}
for (const key of ["clothes","shoes","flipflops","backpack","trash"]) {
  maps.bedroom.objects.push({type:"playerClutterBlock",roomItem:key});
}
// Recupera um save que tenha ficado dentro de um móvel reposicionado.
const roomUpdateBeforeFix=update;
let roomPositionChecked=false;
update=function(dt) {
  if (state?.room!=="bedroom") roomPositionChecked=false;
  if (state?.room==="bedroom" && !roomPositionChecked && spriteReady(playerRoomSprites.bed) && spriteReady(playerRoomSprites.desk) && spriteReady(playerRoomSprites.shelf) && spriteReady(playerRoomSprites.nightstand)) {
    roomPositionChecked=true;
    if (solid(state.x,state.y)) {
      search: for(let radius=4;radius<200;radius+=4) {
        for(let angle=0;angle<Math.PI*2;angle+=Math.PI/8) {
          const x=state.x+Math.cos(angle)*radius,y=state.y+Math.sin(angle)*radius;
          if(!solid(x,y)){state.x=x;state.y=y;break search;}
        }
      }
    }
  }
  roomUpdateBeforeFix(dt);
};

$("version").textContent = "PROTÓTIPO · 0.6.30";
  
  requestAnimationFrame(frame);
  showBootSplash();
})();


