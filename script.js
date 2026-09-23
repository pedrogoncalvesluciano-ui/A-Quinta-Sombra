/*CODIGO JAVA SCRIPT*/
"use strict";

/*
  A QUINTA SOMBRA — 0.8.6

  Base incremental em Canvas.
  Sem bibliotecas ou imagens externas.

  Abertura, exploração da casa e primeira investigação do desaparecimento.
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
    key: "Procure a chave reserva no relógio parado da sala.",
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
    village: "Forgotten · bairro residencial"
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
    h: 1900,

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
        "neighborHouse"
      ),

      // O mercado fica em uma área separada ao norte e será acessado depois.
      // A passagem norte permanece visualmente livre.

      // Casas residenciais provisórias.
      obj(80, 115, 180, 135, "building"),
      obj(300, 115, 165, 135, "building"),
      obj(790, 245, 180, 120, "building"),
      obj(1015, 240, 175, 125, "building"),
      obj(75, 245, 170, 120, "building"),
      obj(290, 245, 165, 120, "building"),
      obj(795, 555, 175, 145, "building"),
      obj(
        1010, 560, 175, 140,
        "policeStation"
      ),
      obj(120, 870, 180, 135, "building"),
      obj(835, 870, 190, 135, "building")

      // Oeste, leste e norte continuam como ruas normais, sem portões.
      // O bloqueio é lógico e só exibe uma mensagem ao tentar atravessar.
    ],

    doors: [
      door(442, 742, null, 0, 0, "Entrar em casa", "home"),
      door(180, 708, null, 0, 0, "Bater na casa da vizinha", "neighborDoor"),
      door(1098, 708, null, 0, 0, "Entrar na delegacia", "policeDoor")
    ]
  };

  // Área separada ao sul: estrada de terra e casa do velho.
  maps.oldRoad = {
    w: 960,
    h: 1220,

    objects: [
      obj(565, 815, 245, 165, "oldHouse")
    ],

    doors: []
  };

  roomNames.oldRoad = "Estrada de terra · sul do bairro";

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
      ? ["idle", "walk", "thrust", "hurt"]
      : ["idle", "walk"];

  for (const animation of animations) {
    const image = new Image();

    image.src =
      `assets/sprites/characters/${kind}/${animation}.png?v=0.8.3`;

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
    `assets/sprites/house/player-room/${filename}?v=0.6.40`;
  playerRoomSprites[key] = image;
}

// Em alguns navegadores o cache antigo podia manter uma falha de imagem.
// Ao concluir cada carregamento, o próximo frame já usa o sprite real.
for (const image of [
  ...Object.values(playerRoomSprites),
  ...Object.values(characterSpriteSheets).flatMap(set => Object.values(set))
]) {
  image.addEventListener("load", () => {
    roomPositionChecked = false;
  }, { once: true });
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

  const wakingUp =
    kind === "player" &&
    state &&
    state.wakeUp &&
    state.wakeUp.active &&
    sheets.hurt;

  const punching =
    kind === "player" &&
    state &&
    state.danger &&
    state.danger.punch > 0 &&
    sheets.thrust;

  let animation = "idle";
  let frame = 0;

  if (wakingUp) {
    animation = "hurt";

    const wakeProgress = Math.max(
      0,
      Math.min(0.999, (state.wakeUp.time - 0.85) / 1.45)
    );

    // hurt.png tem 13 quadros. Ao contrário, a queda vira o player levantando.
    frame = 12 - Math.floor(wakeProgress * 13);
  } else if (punching) {
    // O spritesheet thrust atual possui quadros incompatíveis com a
    // composição de roupa do protagonista e alguns quadros são quase
    // transparentes. Mantemos o player visível com idle em TODAS as
    // direções e desenhamos o impacto separadamente.
    animation = "idle";
    frame = 0;
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

  let image = sheets[animation];

  const imageReady = candidate =>
    Boolean(
      candidate &&
      candidate.complete &&
      candidate.naturalWidth > 0 &&
      candidate.naturalHeight > 0
    );

  // Se a animação de caminhada ainda não carregou (ou falhou no cache),
  // mantém o personagem usando o sprite real de idle em vez do fallback
  // geométrico de Canvas. Isso evita a mãe "virar boneco de blocos".
  if (
    !imageReady(image) &&
    animation !== "idle" &&
    imageReady(sheets.idle)
  ) {
    animation = "idle";
    frame = 0;
    image = sheets.idle;
  }

  if (!imageReady(image)) {
    return false;
  }

  const columns = Math.max(
    1,
    Math.floor(
      image.naturalWidth / CHARACTER_FRAME_SIZE
    )
  );

  // Protege contra spritesheets com menos quadros do que o ciclo esperado.
  frame = Math.max(
    0,
    Math.min(frame, columns - 1)
  );

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

      if (
        type === "brotherbed" &&
        state.stage !== "prologue" &&
        !state.chapter7?.brotherFollowing
      ) {
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

    // 0.8.4: volume da construção em camadas.
    rect(x + 11, y + 25, w + 3, h - 2, "#02070a55");
    rect(x + 6, y + 18, w + 2, h, "#0810183b");

    rect(x, y + 30, w, h - 30, "#6e6b58");
    rect(x, y + h - 12, w, 12, "#585544");
    rect(x + w - 7, y + 35, 7, h - 35, "#4f5145");
    rect(x + 5, y + 35, 4, h - 42, "#85816c55");

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

    rect(x - 10, y, w + 20, 55, "#2d3a40");
    rect(x - 7, y + 3, w + 14, 4, "#526168");
    rect(x - 10, y + 50, w + 20, 7, "#1b262b");

    for (let j = 3; j < 50; j += 9) {
      for (let i = 0; i < w; i += 18) {
        rect(x + i, y + j, 15, 5, "#47565a");
      }
    }

    rect(x + w / 2 - 18, y + h - 49, 36, 49, "#382e29");

    for (const wx of [x + 24, x + w - 51]) {
      rect(wx - 2, y + 70, 32, 35, "#1b2223");
      rect(wx, y + 72, 28, 31, "#292f30");

      const nightWindow =
        state &&
        state.stage !== "prologue" &&
        (
          state.minutes < 420 ||
          state.minutes >= 1080
        );

      const litWindow =
        nightWindow &&
        hash(wx + x, y + h) > 0.36;

      rect(
        wx + 3,
        y + 75,
        22,
        25,
        state && state.stage === "prologue"
          ? "#a8b3a1"
          : litWindow
            ? "#c5aa68"
            : "#68716a"
      );

      if (litWindow) {
        rect(wx + 5, y + 77, 18, 2, "#e0c98b66");
      }

      rect(wx + 13, y + 73, 2, 29, "#343732");
      rect(wx, y + 87, 28, 2, "#343732");
    }

    if (type === "market") {
      rect(x + 20, y + 48, w - 40, 16, "#282f30");
      txt("MERCADO", x + 57, y + 60, "#d0ba85", 9);
      rect(x + w / 2 - 30, y + h + 2, 60, 22, "#85684a");
    }

    if (type === "neighborHouse") {
      rect(x + 19, y + 49, w - 38, 11, "#42372f");
      txt("Nº 8", x + w / 2 - 11, y + h - 55, "#bda77d", 7);
    }

    if (type === "policeStation") {
      rect(x + 22, y + 48, w - 44, 17, "#26323a");
      txt("POLÍCIA", x + 59, y + 60, "#d1c9ad", 9);
      rect(x + w / 2 - 24, y + h + 2, 48, 18, "#555d5b");
    }

    if (type === "oldHouse") {
      rect(x + 18, y + 48, w - 36, 12, "#40362f");
      txt("CASA", x + w / 2 - 16, y + 59, "#9f9276", 8);
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

    if (state.room === "westRoad") {
      v0649DrawWestEnvironment(m);
    } else if (state.room === "square") {
      v0648DrawSquareEnvironment(m);
    } else if (state.room === "village") {
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

      // Rua principal vertical. Ao sul o asfalto vira estrada de terra
      // e segue de verdade até a região da casa do velho.
      rect(610, 0, 78, 1020, "#706b5f");
      rect(610, 1020, 78, m.h - 1020, "#655442");

      // A estrada de terra segue até o limite sul do bairro.
      // No fim, o jogador escolhe avançar para a área seguinte.

      // Cruzamento superior.
      rect(0, 385, 1280, 78, "#706b5f");

      // Rua inferior: livre desde a primeira saída.
      rect(0, 755, 1280, 82, "#706b5f");

      // Entrada curta da casa da família até a rua principal.
      rect(420, 710, 190, 45, "#706b5f");

      // Calçadas e meios-fios: ajudam a separar rua, casas e gramado.
      rect(590, 0, 16, 1020, "#8b877c");
      rect(692, 0, 16, 1020, "#8b877c");
      rect(0, 369, 1280, 16, "#8b877c");
      rect(0, 463, 1280, 16, "#8b877c");
      rect(0, 739, 1280, 16, "#8b877c");
      rect(0, 837, 1280, 16, "#8b877c");

      // Marcação central discreta da rua principal.
      for (let y = 24; y < 1000; y += 54) {
        rect(647, y, 4, 22, "#b9ad87");
      }

      // Textura de terra do caminho do velho.
      for (let y = 1040; y < m.h; y += 26) {
        const drift = (Math.floor(y / 26) % 2) * 17;
        rect(620 + drift, y, 12, 4, "#75624d");
        rect(663 - drift / 2, y + 11, 9, 3, "#514333");
      }

      // Postes simples, sem colisão, para dar leitura de bairro residencial.
      for (const [lx, ly] of [
        [575, 330], [705, 520], [575, 690], [705, 900],
        [270, 475], [990, 475]
      ]) {
        rect(lx, ly, 4, 34, "#343a39");
        rect(lx - 4, ly - 3, 12, 5, "#4d5350");
        rect(lx - 2, ly - 1, 8, 3, "#d2b777");
      }

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
        prepareMother();

        if (state.mother.y <= state.y) {
          drawMother();
        }
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
      prepareMother();

      if (state.mother.y <= state.y) {
        drawMother();
      }

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

    if (
      state.stage === "prologue" &&
      state.mother &&
      state.mother.y > state.y
    ) {
      drawMother();
    }

    if (state.room === "bedroom") {
      drawPlayerRoomForeground(m);
    }

    c.restore();

    // Iluminação gradual por horário.
    // O prólogo acontece às 14:00, portanto também usa luz de dia.
    const lightMinutes =
      state.stage === "prologue"
        ? 14 * 60
        : ((state.minutes % 1440) + 1440) % 1440;

    let night = 0.03;

    if (lightMinutes < 300) {
      night = 0.34;
    } else if (lightMinutes < 420) {
      const p = (lightMinutes - 300) / 120;
      night = 0.34 - p * 0.29;
    } else if (lightMinutes < 1020) {
      night = 0.03;
    } else if (lightMinutes < 1260) {
      const p = (lightMinutes - 1020) / 240;
      night = 0.03 + p * 0.29;
    } else {
      night = 0.34;
    }

    rect(0, 0, W, H, `rgba(6,16,37,${night})`);

    // Um tom quente entra e sai devagar no amanhecer/entardecer.
    const dawnWarm = Math.max(
      0,
      1 - Math.abs(lightMinutes - 390) / 100
    );
    const duskWarm = Math.max(
      0,
      1 - Math.abs(lightMinutes - 1080) / 130
    );
    const warm = Math.max(dawnWarm, duskWarm) * 0.10;

    if (warm > 0) {
      rect(0, 0, W, H, `rgba(181,116,72,${warm})`);
    }

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
    const backDistance = 58;
    const sideDistance = 24 * mother.preferredSide;

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

  function motherOverlapsFather(x, y) {
    if (
      state.stage !== "prologue" ||
      !Number.isFinite(state.x) ||
      !Number.isFinite(state.y)
    ) {
      return false;
    }

    const dx = (x - state.x) / 19;
    const dy = (y - state.y) / 13;

    return dx * dx + dy * dy < 1;
  }

  function motherBlocksPlayer(x, y) {
    if (
      state.stage !== "prologue" ||
      !state.mother ||
      !Number.isFinite(state.mother.x) ||
      !Number.isFinite(state.mother.y)
    ) {
      return false;
    }

    const dx = (x - state.mother.x) / 19;
    const dy = (y - state.mother.y) / 13;

    return dx * dx + dy * dy < 1;
  }

  function motherTryMove(dx, dy) {
    const mother = state.mother;

    const nx = mother.x + dx;
    const ny = mother.y + dy;

    if (
      !solid(nx, ny) &&
      !motherOverlapsFather(nx, ny)
    ) {
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
      distanceToFather >= 52 &&
      distanceToFather <= 86 &&
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

    if (mother.pause > 0 && distanceToFather < 96) {
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
      ["Pai", "Qualquer coisa, manda mensagem. O celular está carregado, né?"],
      ["Você", "Tá. Vocês vão demorar?"],
      ["Pai", "Vamos comprar as coisas rápido e já voltar."],
      ["Mãe", "Se a gente demorar, não sai com seu irmão. Manda mensagem primeiro."],
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
    $("day").textContent =
      state.stage === "prologue"
        ? "PRÓLOGO · TARDE"
        : state.day
          ? "DIA " + state.day
          : "NOITE DO DESAPARECIMENTO";

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
          ? "DIA · 1 HORA = 01:00"
          : "NOITE · 1 HORA = 01:00"
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
              "9 horas depois",
              "23:00 · Seus pais ainda não voltaram.",
              () => {
                state.minutes = 1380;
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
            [
              "Ainda vazia. Não há nenhum sinal deles.",
              "Se saíram só para comprar mantimentos, alguma coisa aconteceu depois que deixaram o mercado."
            ],
            () => stage("talk")
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
            [
              "Ainda tem o suficiente para esta noite.",
              "Meu irmão acabou de comer. Procurar mais comida agora não vai ajudar a encontrar meus pais."
            ],
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
              ["Irmão", "Eles ainda não voltaram?"],
              ["Você", "Ainda não."],
              ["Irmão", "Você vai sair pra procurar?"],
              ["Você", "Primeiro vou ver se eles deixaram alguma coisa que ajude."],
              ["Irmão", "A porta está trancada."],
              [
                "Você",
                "Tem uma chave reserva. Acho que o pai escondia ela atrás do relógio parado da sala."
              ],
              ["Irmão", "Só volta antes de amanhecer, tá?"]
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
                "A sequência inicial terminou. Continue investigando o desaparecimento, cuide do seu irmão e observe o que muda em Forgotten.\n\nSeu progresso fica salvo neste navegador.",
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
                ? "Acho que esse relógio fica na sala."
                : "Você fica comigo um pouco?"
            ]
          ]);
        }
        break;

      case "bed":
        if (state.stage === "sleep") {
          fade(
            "1 hora depois",
            "00:00 · DIA 1",
            () => {
              state.minutes = 0;
              state.day = 1;
              state.dawnCollapseArmed = true;
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
            "00:00 · Forgotten está quase vazia. A casa de Florinda ainda tem luz; a delegacia também.",
            () => {
              state.firstExit = true;
              go("village", 442, 742);
              stage("free");
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

    const speed =
      state.oldManEvent?.runUnlocked &&
      (keys.has("shift") || keys.has("f"))
        ? 150
        : 90;
    const length = Math.hypot(dx, dy) || 1;

    dx = dx / length * speed * dt;
    dy = dy / length * speed * dt;

    if (dx || dy) {
      if (
        !solid(state.x + dx, state.y) &&
        !motherBlocksPlayer(state.x + dx, state.y)
      ) {
        state.x += dx;
      }

      if (
        !solid(state.x, state.y + dy) &&
        !motherBlocksPlayer(state.x, state.y + dy)
      ) {
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

      // CICLO DE TEMPO:
      // Primeira noite (Dia 1, até 07:00): 1 hora = 30 segundos reais.
      // Demais períodos ativos: 1 hora = 1 minuto real.
      // Às 14:00 o relógio continua parando até o player dormir.
      const firstNightFast =
        state.day === 1 &&
        state.minutes < 420;

      const timeRate = firstNightFast ? 2 : 1;

      state.minutes += dt * timeRate;

      // A primeira meia-noite depois do desaparecimento dos pais
      // apenas arma o colapso das 07:00. O número do dia só muda
      // quando o protagonista desmaia e acorda novamente às 00:00.
      if (state.minutes >= 1440) {
        state.minutes -= 1440;

        if (state.day === 0) {
          state.day = 1;
        }

        state.dawnCollapseArmed = true;
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

      // 0.6.32: o antigo colapso rápido ao amanhecer foi removido.
      // Agora o jogador aguenta até 07:00 e então apaga automaticamente,
      // avançando para o próximo dia às 00:00.
      state.sun = 0;

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
            <strong>INVENTÁRIO</strong>
            <kbd>I</kbd>
            <p>Consulte itens carregados e pistas já coletadas.</p>
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

      // Corrige saves das versões 0.6.39–0.6.41 que podiam ficar
      // presos no limite norte depois do desaparecimento dos pais.
      if (
        state.stage !== "prologue" &&
        state.day === 0 &&
        state.minutes >= 1380 &&
        state.minutes < 1440 &&
        state.room === "village"
      ) {
        state.room = "bedroom";
        state.x = housePoint(180);
        state.y = housePoint(235);
        state.facing = "down";
        state.walk = 0;
      }

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
              "Ao sair novamente, preste atenção aos avisos e aos sons ao redor da casa."
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
    "Na margem, quase escondido: “perguntar sobre o poço”.",

  photo:
    "Uma fotografia do aniversário de Estevão, tirada perto da escada. " +
    "O pai aparece de manga curta.",

  note:
    "Se voltarmos diferentes, compare a fotografia."
};

const clueSpots = [
  [
    "parents", 125, 165,
    "list", "Coletar pista"
  ],
  [
    "parents", 440, 170,
    "photo", "Coletar pista"
  ],
  [
    "parents", 320, 250,
    "note", "Coletar pista"
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
      q.clues.length + "/3 pistas. C: celular.",

    chest:
      "Abra o segundo baú no sótão. " +
      "Consulte as pistas com J.",

    camera:
      "Aproxime-se da figura diante do portão norte.",

    done:
      "Registro salvo. O caminho oeste será a próxima " +
      "investigação. C: celular."
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
        "Voltar ao celular",
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
        !q.clues.includes(id)
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
          "Eu ouvi passos lá embaixo enquanto você estava fora."
        ],
        [
          "Você",
          "Você viu alguém?"
        ],
        [
          "Irmão",
          "Não. Quando eu fui olhar, já tinha parado."
        ]
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

  if (!["list", "photo", "note"].includes(id)) {
    return;
  }

  if (q.clues.includes(id)) {
    return;
  }

  q.clues.push(id);

  const clueNames = {
    list: "Lista de mantimentos",
    photo: "Fotografia da família",
    note: "Bilhete dos pais"
  };

  v06Toast("Pista coletada: " + clueNames[id], 2.2);

  if (q.clues.length >= 3) {
    q.phase = "cluesDone";
  }

  updateHud();
  save();
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

      if (q.clues.includes(id)) continue;

      rect(
        x - 5,
        y - 7,
        10,
        7,
        "#dfc997"
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

objectives.key = "Procure a chave reserva no relógio parado da sala.";
objectives.supplies = "Investigue o desaparecimento e converse com quem ainda está acordado.";
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

const v06CameraChest = null;


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

  if (!state.policeReportedEvents || typeof state.policeReportedEvents !== "object") {
    state.policeReportedEvents = {};
  }

  if (!Number.isFinite(state.policeReportedEvents.vanSightings)) {
    state.policeReportedEvents.vanSightings = 0;
  }

  if (!Number.isFinite(state.policeReportedEvents.oldManEncounters)) {
    state.policeReportedEvents.oldManEncounters = 0;
  }

  if (!Number.isFinite(state.policeReportedEvents.parentsDay)) {
    state.policeReportedEvents.parentsDay = -1;
  }

  if (!Number.isFinite(state.dawnCollapseCount)) {
    state.dawnCollapseCount = 0;
  }

  if (typeof state.dawnCollapseArmed !== "boolean") {
    state.dawnCollapseArmed =
      state.day >= 1 ||
      state.dawnCollapseCount > 0;
  }

  if (state.day >= 1 && state.stage !== "prologue") {
    state.dawnCollapseArmed = true;
  }

  if (!state.wakeUp || typeof state.wakeUp !== "object") {
    state.wakeUp = { active: false, time: 0 };
  }

  if (typeof state.wakeUp.active !== "boolean") {
    state.wakeUp.active = false;
  }

  if (!Number.isFinite(state.wakeUp.time)) {
    state.wakeUp.time = 0;
  }

  if (!Number.isFinite(state.brotherDawnTalkCount)) {
    state.brotherDawnTalkCount = 0;
  }

  if (!Number.isFinite(state.squareManTalks)) {
    state.squareManTalks = 0;
  }

  if (typeof state.squareManFirstSpeechDone !== "boolean") {
    state.squareManFirstSpeechDone = state.squareManTalks > 0;
  }

  if (typeof state.squareManReturnObserverPending !== "boolean") {
    state.squareManReturnObserverPending = false;
  }

  if (!Number.isFinite(state.squareManReturnObserverSeenDay)) {
    state.squareManReturnObserverSeenDay = -1;
  }

  if (!state.dawnCollapse || typeof state.dawnCollapse !== "object") {
    state.dawnCollapse = {
      active: false,
      phase: "idle",
      time: 0
    };
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
  if (!state) return;

  // A drenagem real é aplicada no update final da 0.6.45.
  // Mantemos apenas o relógio antigo sincronizado para saves anteriores.
  state.foodClock = v06AbsoluteMinutes();

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
        state.brotherFood = 100;
        state.firstNightFoodInitialized = true;
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
    const firstDelivery =
      !state.finished &&
      state.day !== 1;

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

  // A vizinha fica dentro da própria casa.
  if (state.room === "shop") {
    c.save();
    c.translate(
      -Math.floor(camera.x),
      -Math.floor(camera.y)
    );

    person(
      housePoint(355),
      housePoint(128),
      "npcFemale",
      0,
      "down",
      0.9
    );

    txt(
      "VIZINHA",
      housePoint(330),
      housePoint(82),
      "#d7c49b",
      7
    );

    c.restore();
  }

  // Policial visível atrás do balcão da delegacia.
  if (state.room === "police") {
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
      0.92
    );

    txt(
      "POLICIAL",
      housePoint(329),
      housePoint(82),
      "#d7c49b",
      7
    );

    c.restore();
  }

  if (state.stage !== "prologue") {
    // A barra de perigo foi removida. O jogador recebe somente
    // avisos diegéticos na tela quando a ameaça muda de estado.

    // ALIMENTAÇÃO — vertical à direita.
    const barW = 11;
    const barH = 130;
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
      16,
      w,
      24,
      "#0b131beb"
    );

    txt(
      v06ToastText,
      W / 2 - w / 2 + 9,
      32,
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
  "WASD / setas: andar. Shift: correr. E: interagir. Esc: pausar. ESPAÇO: soco perto de uma ameaça.\n\nNão existe mais uma barra de perigo: mudanças importantes são avisadas diretamente na tela. A ALIMENTAÇÃO do irmão continua à direita e pode piorar ao mesmo tempo em que outros eventos acontecem.\n\nVocê carrega no máximo uma porção. A vizinha pode ajudar no começo da história.\n\nÀs 07:00, depois da primeira meia-noite, o protagonista perde os sentidos e o ciclo avança.",
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

  // A saída dos pais acontece à tarde, inclusive em saves anteriores.
  if (state.stage === "prologue") state.minutes = 14 * 60;

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
      "DIA · 1 HORA = 01:00";
  } else {
    $("timeNote").textContent =
      "NOITE · 1 HORA = 01:00";
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
  if (state.policeReportedEvents.parentsDay === state.day) {
    say([
      ["Policial", "Mas eu já te falei sobre isso."],
      ["Policial", "Se surgir alguma novidade sobre seus pais, eu aviso."]
    ]);
    return;
  }

  state.policeReportedEvents.parentsDay = state.day;
  const count = state.policeReports.parents++;

  const lines =
    count === 0
      ? [
          ["Policial", "Certo. Desde quando seus pais estão desaparecidos?"],
          ["Você", "Eles foram ao mercado e não voltaram."],
          ["Policial", "Você tentou ligar ou mandar mensagem?"],
          ["Você", "Tentei. O da minha mãe fica sem sinal. O do meu pai aparece fora de área, até dentro de casa."],
          ["Policial", "Vou anotar isso também. Pode ser só problema de rede, mas é informação."],
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
  if (
    state.storyEvents.oldManEncounters <=
    state.policeReportedEvents.oldManEncounters
  ) {
    say([
      ["Policial", "Sim, eu sei quem é o Raimundo."],
      ["Policial", "Ele mora naquela estrada há muito tempo."]
    ]);
    return;
  }

  state.policeReportedEvents.oldManEncounters =
    state.storyEvents.oldManEncounters;

  state.policeReports.oldMan += 1;

  say(
    [
      ["Você", "Encontrei um homem chamado Raimundo na estrada do sul."],
      ["Policial", "Raimundo? Ele trabalhou na antiga mina quando era mais novo."],
      ["Você", "Ele disse que conhece minha família."],
      ["Policial", "Ele conhece muita história antiga da cidade. Se ele falou da mina, escute com cuidado, mas não entre naquele lugar."]
    ],
    save
  );
}

function v0630PoliceVan() {
  if (
    state.storyEvents.vanSightings <=
    state.policeReportedEvents.vanSightings
  ) {
    say([
      ["Policial", "Mas eu já te falei sobre isso."],
      ["Policial", "Se a van aparecer de novo, aí você volta e me conta."]
    ]);
    return;
  }

  state.policeReportedEvents.vanSightings =
    state.storyEvents.vanSightings;

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
    "Delegacia",
    "",
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
        ["Vizinha", "E o celular? Conseguiu falar com algum deles?"],
        ["Você", "Não. Minha mãe continua sem sinal e o telefone do meu pai aparece fora de área."],
        ["Vizinha", "Se isso mudar, me avisa. Por enquanto, leve isto para o seu irmão."],
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
            state.day = 0;
            state.minutes = 1380;
            state.dawnCollapseArmed = false;
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
      "Siga pela rua principal para o norte.";
  } else if (state.stage === "supplies") {
    $("objective").textContent =
      "Investigue o desaparecimento e converse com quem ainda está acordado.";
  } else if (state.stage === "return") {
    $("objective").textContent =
      "Volte para casa quando achar que já investigou o suficiente.";
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
// =========================================================
// 0.6.32 — COLAPSO DAS 07:00 / NOVO DIA ÀS 00:00
// =========================================================

const v0632Base = {
  update,
  drawWorld,
  interact,
  updateHud
};

function v0632StartDawnCollapse() {
  prepareSystems();

  if (
    !state ||
    state.stage === "prologue" ||
    state.gameOver ||
    state.dawnCollapse.active
  ) {
    return;
  }

  state.dawnCollapse.active = true;
  state.dawnCollapse.phase = "dizzy";
  state.dawnCollapse.time = 0;

  keys.clear();
  near = null;
  $("prompt").hidden = true;
}

function v0632WakeNextDay() {
  state.dawnCollapseCount += 1;
  state.day = Math.max(1, state.day || 0) + 1;
  state.minutes = 0;
  state.dawnCollapseArmed = true;
  state.forcedSleepDue = false;
  state.sun = 0;

  // Volta ao quarto do protagonista.
  state.room = "bedroom";
  state.x = housePoint(180);
  state.y = housePoint(235);
  state.facing = "down";
  state.walk = 0;

  // Mantém o relógio alimentar coerente com o novo dia.
  if (typeof v06AbsoluteMinutes === "function") {
    state.foodClock = v06AbsoluteMinutes();
  }

  state.dawnCollapse.active = false;
  state.dawnCollapse.phase = "idle";
  state.dawnCollapse.time = 0;

  state.wakeUp.active = true;
  state.wakeUp.time = 0;
  keys.clear();
  near = null;
  $("prompt").hidden = true;

  updateHud();
  save();
}

update = function(dt) {
  prepareSystems();

  if (state?.dawnCollapse?.active) {
    state.dawnCollapse.time += dt;
    elapsed += dt;

    if (
      state.dawnCollapse.phase === "dizzy" &&
      state.dawnCollapse.time >= 2.2
    ) {
      state.dawnCollapse.phase = "black";
      state.dawnCollapse.time = 0;
    } else if (
      state.dawnCollapse.phase === "black" &&
      state.dawnCollapse.time >= 1.35
    ) {
      state.dawnCollapse.phase = "dayCard";
      state.dawnCollapse.time = 0;
    } else if (
      state.dawnCollapse.phase === "dayCard" &&
      state.dawnCollapse.time >= 3.4
    ) {
      v0632WakeNextDay();
    }

    return;
  }

  v0632Base.update(dt);

  if (
    state &&
    state.stage !== "prologue" &&
    !state.gameOver &&
    state.day >= 1 &&
    state.minutes >= 420 &&
    !state.dawnCollapse.active
  ) {
    state.minutes = 420;
    state.dawnCollapseArmed = true;
    v0632StartDawnCollapse();
  }
};

drawWorld = function() {
  v0632Base.drawWorld();

  if (!state?.dawnCollapse?.active) return;

  // 0.7.8: informa ao passe final que esta camada visual já foi desenhada.
  v078DawnOverlayDrawnThisFrame = true;

  const collapse = state.dawnCollapse;

  if (collapse.phase === "dizzy") {
    const p = Math.min(1, collapse.time / 2.2);

    // Escurecimento gradual.
    rect(0, 0, W, H, `rgba(8,10,14,${0.12 + p * 0.56})`);

    // Faixas deslocadas e estática para dar sensação de visão falhando.
    for (let i = 0; i < 14; i++) {
      const y = (i * 31 + Math.sin(elapsed * 7 + i) * 10 + H) % H;
      const h = 3 + (i % 4) * 2;
      const alpha = 0.03 + p * 0.11;

      rect(
        Math.sin(elapsed * 9 + i) * 9,
        y,
        W,
        h,
        `rgba(210,214,205,${alpha})`
      );
    }

    const pulse = 0.08 + Math.abs(Math.sin(elapsed * 5)) * 0.16 * p;
    rect(0, 0, W, H, `rgba(90,82,73,${pulse})`);

    if (collapse.time > 0.55) {
      txt(
        collapse.time < 1.25
          ? "Minha cabeça..."
          : "Eu não estou conseguindo ficar em pé.",
        24,
        H - 28,
        "#d7d0bd",
        8
      );
    }
  }

  if (collapse.phase === "black") {
    rect(0, 0, W, H, "#000");
  }

  if (collapse.phase === "dayCard") {
    rect(0, 0, W, H, "#000");

    const previousDay = Math.max(1, state.day || 1);
    const nextDay = previousDay + 1;
    const t = collapse.time;

    // O dia anterior desce devagar até o centro.
    const drop = Math.min(1, t / 1.25);
    const easedDrop = 1 - Math.pow(1 - drop, 3);
    const titleY = -24 + (H / 2 + 20) * easedDrop;

    // Primeiro mostra o dia anterior. Depois o número muda.
    const shownDay = t < 1.45 ? previousDay : nextDay;

    // Nos instantes finais, o texto desaparece suavemente.
    const fadeOut = t < 2.55
      ? 1
      : Math.max(0, 1 - (t - 2.55) / 0.75);

    c.save();
    c.globalAlpha = fadeOut;

    txt(
      "DIA " + shownDay,
      W / 2 - 34,
      titleY,
      "#d8d1bc",
      14
    );

    if (t >= 1.45) {
      txt(
        "00:00",
        W / 2 - 18,
        titleY + 22,
        "#9f9989",
        9
      );
    }

    c.restore();
  }
};

interact = function(action) {
  prepareSystems();

  if (
    action === "brother" &&
    state.dawnCollapseCount > state.brotherDawnTalkCount
  ) {
    state.brotherDawnTalkCount = state.dawnCollapseCount;

    say(
      [
        ["Irmão", "Eu escutei passos..."],
        ["Irmão", "Mas eu não saí do quarto para ver."]
      ],
      save
    );

    return;
  }

  v0632Base.interact(action);
};

updateHud = function() {
  v0632Base.updateHud();

  if (!state || state.stage === "prologue") return;

  if (state.dawnCollapse?.active) {
    $("timeNote").textContent = "VOCÊ ESTÁ PERDENDO OS SENTIDOS";
    return;
  }

  if (state.dawnCollapseArmed && state.minutes >= 360) {
    $("timeNote").textContent = "AMANHECER · ÀS 07:00 VOCÊ NÃO CONSEGUE CONTINUAR";
  }
};

// =========================================================
// 0.6.33 — HOMEM DA PRAÇA / FALAS SOBRE O OBSERVADOR
// =========================================================

const v0633SquareMan = {
  // Calçada da praça, no lado leste da cidade.
  x: 950,
  y: 500
};

const v0634SquareManVariants = [
  "Ele não gosta quando você volta cedo. Seu irmão está seguro agora?",
  "Seu irmão ainda escuta vozes?",
  "Você já se perguntou por que acorda sempre no mesmo lugar?"
];

let v0634StaticUntil = 0;
let v0634ObserverUntil = 0;
let v0634ObserverX = 0;
let v0634ObserverY = 0;
let v0634WasInSquareSide = false;

function v0633DrawWheelchairMan() {
  if (
    !state ||
    state.room !== "square" ||
    state.stage === "prologue" ||
    state.storyFlags?.wheelchairGone
  ) {
    return;
  }

  const x = v0633SquareMan.x;
  const y = v0633SquareMan.y;

  c.save();
  c.translate(-Math.floor(camera.x), -Math.floor(camera.y));

  // Rodas.
  c.strokeStyle = "#1c2225";
  c.lineWidth = 3;
  c.beginPath();
  c.arc(x - 10, y - 5, 12, 0, Math.PI * 2);
  c.arc(x + 11, y - 5, 12, 0, Math.PI * 2);
  c.stroke();

  // Estrutura da cadeira.
  rect(x - 13, y - 20, 27, 4, "#42494b");
  rect(x - 11, y - 18, 4, 18, "#42494b");
  rect(x + 9, y - 18, 4, 18, "#42494b");
  rect(x + 10, y - 28, 4, 14, "#42494b");

  // Corpo sentado provisório.
  rect(x - 7, y - 37, 14, 18, "#4e5554");
  rect(x - 5, y - 48, 10, 11, "#bc9071");
  rect(x - 6, y - 50, 12, 5, "#50483f");
  rect(x - 10, y - 35, 4, 13, "#bc9071");
  rect(x + 6, y - 35, 4, 13, "#bc9071");

  txt("HOMEM", x - 17, y - 59, "#a8aa9c", 7);

  c.restore();
}

function v0633TalkSquareMan() {
  prepareSystems();

  const talks = state.squareManTalks || 0;

  if (!state.squareManFirstSpeechDone) {
    state.squareManFirstSpeechDone = true;
    state.squareManTalks = 1;
    state.squareManReturnObserverPending = false;

    say(
      [
        ["Você", "Onde estão os meus pais?"],
        ["Homem", "Ele está no seu quarto."],
        ["Homem", "Na sua escada."],
        ["Homem", "Na sua casa."],
        ["Homem", "Do lado de fora."],
        ["Homem", "Perto da delegacia."],
        ["Homem", "Está se aproximando..."],
        ["Homem", "...Ele está aqui."],
        ["Você", "Quê?? Eu estou perguntando dos meus pais."],
        ["Homem", "Ele manipula tudo."],
        ["Homem", "Ele vê tudo..."],
        ["Homem", "Menos aqueles que ainda viveram pouco."]
      ],
      save
    );

    return;
  }

  const index = (talks - 1) % v0634SquareManVariants.length;
  const line = v0634SquareManVariants[index];

  state.squareManTalks += 1;

  say(
    [
      ["Homem", line]
    ],
    save
  );
}

const v0633Base = {
  getNear,
  interact,
  drawWorld
};

getNear = function() {
  if (
    state?.room === "square" &&
    state.stage !== "prologue"
  ) {
    const distance = Math.hypot(
      state.x - v0633SquareMan.x,
      state.y - v0633SquareMan.y
    );

    if (distance < 46) {
      return {
        label: "Falar com o homem da praça",
        action: "squareMan"
      };
    }
  }

  return v0633Base.getNear();
};

interact = function(action) {
  if (action === "squareMan") {
    v0633TalkSquareMan();
    return;
  }

  v0633Base.interact(action);
};

drawWorld = function() {
  v0633Base.drawWorld();
  v0633DrawWheelchairMan();
};

// =========================================================
// 0.6.34 — ESTÁTICA DO HOMEM DA PRAÇA E OBSERVADOR NA VOLTA
// =========================================================

const v0634RenderDialogBase = renderDialog;
renderDialog = function() {
  v0634RenderDialogBase();

  if (
    dialog &&
    dialog.lines &&
    dialog.lines[dialog.i] &&
    dialog.lines[dialog.i][1] === "...Ele está aqui."
  ) {
    v0634StaticUntil = Math.max(v0634StaticUntil, elapsed + 0.85);
  }
};

function v0634TriggerReturnObserver() {
  if (
    !state ||
    state.room !== "square" ||
    state.stage === "prologue" ||
    !state.squareManReturnObserverPending
  ) {
    return;
  }

  state.squareManReturnObserverPending = false;
  state.squareManReturnObserverSeenDay = state.day;

  // Silhueta aparece alguns metros à frente, próxima da saída da praça.
  v0634ObserverX = 790;
  v0634ObserverY = 520;
  v0634ObserverUntil = elapsed + 0.8;
  v0634StaticUntil = elapsed + 1.05;

  save();
}

const v0634UpdateBase = update;
update = function(dt) {
  v0634UpdateBase(dt);

  if (!state || state.room !== "square" || state.stage === "prologue") {
    v0634WasInSquareSide = false;
    return;
  }

  if (state.x >= 860) {
    v0634WasInSquareSide = true;
  }

  // Ao voltar da região da praça para a parte principal,
  // o Observador aparece por um instante e some na estática.
  if (
    v0634WasInSquareSide &&
    state.x <= 805 &&
    state.squareManReturnObserverPending &&
    !dialog &&
    !transitionBusy
  ) {
    v0634WasInSquareSide = false;
    v0634TriggerReturnObserver();
  }
};

const v0634DrawWorldBase = drawWorld;
drawWorld = function() {
  v0634DrawWorldBase();

  if (!state || state.room !== "square") return;

  if (elapsed < v0634ObserverUntil) {
    c.save();
    c.translate(-Math.floor(camera.x), -Math.floor(camera.y));

    const x = v0634ObserverX;
    const y = v0634ObserverY;

    // O Observador nunca assume uma anatomia humana estável.
    // A massa baixa sugere um animal grande/agachado, com bordas
    // corroídas pela própria interferência.
    const jitter = Math.sin(elapsed * 43) * 2;

    rect(x - 18 + jitter, y - 19, 34, 13, "#050607");
    rect(x - 11 - jitter, y - 30, 23, 17, "#040506");
    rect(x - 24, y - 12 + jitter, 14, 7, "#040506");
    rect(x + 10, y - 13 - jitter, 17, 8, "#040506");
    rect(x - 15, y - 7, 7, 13, "#030405");
    rect(x + 7, y - 8, 8, 14, "#030405");

    // Fragmentos nas bordas: nunca olhos, boca ou rosto legível.
    if (Math.floor(elapsed * 28) % 2 === 0) {
      rect(x - 21, y - 25, 5, 3, "rgba(5,6,7,0.78)");
      rect(x + 16, y - 20, 6, 3, "rgba(5,6,7,0.72)");
    }

    c.restore();
  }

  if (elapsed < v0634StaticUntil) {
    const strength = Math.min(
      1,
      Math.max(v0634StaticUntil - elapsed, 0) / 0.85
    );

    for (let i = 0; i < 28; i++) {
      const y = (i * 19 + Math.floor(elapsed * 700) % H) % H;
      const h = 1 + (i % 3);
      rect(
        (i % 4) * -4,
        y,
        W + 16,
        h,
        `rgba(225,230,220,${0.04 + strength * 0.14})`
      );
    }

    if (Math.floor(elapsed * 24) % 3 === 0) {
      rect(0, 0, W, H, `rgba(215,220,215,${0.05 + strength * 0.12})`);
    }
  }
};

// =========================================================
// 0.6.37 — LEVANTAR DO CHÃO APÓS O DESMAIO
// =========================================================

const v0637WakeUpdateBase = update;
update = function(dt) {
  prepareSystems();

  if (state?.wakeUp?.active) {
    keys.clear();
    near = null;
    $("prompt").hidden = true;

    state.wakeUp.time += dt;
    elapsed += dt;

    if (state.wakeUp.time >= 2.3) {
      state.wakeUp.active = false;
      state.wakeUp.time = 0;

      const line =
        state.dawnCollapseCount === 1
          ? "Parece que eu desmaiei... e vim parar aqui no meu quarto."
          : "Aconteceu de novo... o que está acontecendo?";

      save();
      say([["Você", line]]);
    }

    return;
  }

  v0637WakeUpdateBase(dt);
};

// =========================================================
// 0.6.40 — RECUPERAÇÃO DE SPRITES E CONTROLES
// =========================================================

function v0640RecoverInputLock() {
  if (!state || mode !== "game") return;

  const transitionEl = $("transition");
  const dialogEl = $("dialog");

  const transitionVisible =
    transitionEl.classList.contains("active") &&
    Number.parseFloat(getComputedStyle(transitionEl).opacity || "0") > 0.05;

  const dialogVisible =
    !dialogEl.hidden &&
    Number.parseFloat(getComputedStyle(dialogEl).opacity || "1") > 0.05;

  // Se não existe nenhuma interface realmente visível bloqueando o jogo,
  // nenhum lock antigo pode impedir o movimento.
  if (
    $("overlay").hidden &&
    !transitionVisible &&
    !dialogVisible &&
    !state.dawnCollapse?.active &&
    !state.wakeUp?.active
  ) {
    transitionBusy = false;

    if (dialog && dialogEl.hidden) {
      dialog = null;
    }
  }
}

// Em captura, limpa locks fantasmas ANTES do listener antigo de teclado.
// Isso evita o caso em que a tela já voltou ao jogo, mas transitionBusy/dialog
// ainda ficaram presos e impedem WASD/setas de entrar no Set de teclas.
window.addEventListener("keydown", event => {
  if (!state || mode !== "game") return;

  v0640RecoverInputLock();

  const key = event.key.toLowerCase();
  const movementKeys = [
    "w", "a", "s", "d",
    "arrowup", "arrowdown", "arrowleft", "arrowright",
    "shift"
  ];

  if (
    movementKeys.includes(key) &&
    $("overlay").hidden &&
    !$("transition").classList.contains("active") &&
    $("dialog").hidden &&
    !state.dawnCollapse?.active &&
    !state.wakeUp?.active
  ) {
    keys.add(key);
  }
}, true);

// =========================================================
// 0.6.39 — CORREÇÕES DE MAPA, SAÍDAS E AVISOS
// =========================================================

let v0639LastDangerPhase = null;
let v0639EdgeNoticeAt = -999;

function v0639EdgeNotice(text) {
  if (elapsed - v0639EdgeNoticeAt < 1.2) return;
  v0639EdgeNoticeAt = elapsed;
  v06Toast(text, 1.8);
}

function v0639FinishPrologueAtNorth() {
  if (
    !state ||
    state.room !== "village" ||
    state.stage !== "prologue" ||
    dialog ||
    transitionBusy
  ) {
    return;
  }

  keys.clear();

  // A chegada ao portão usa um fade antes de reposicionar os pais.
  // Isso evita o corte seco e transforma o fim do trajeto em uma cena.
  fade(
    "",
    "",
    () => {
      // O pai mantém a posição que já funcionava, olhando para baixo.
      state.x = 636;
      state.y = 58;
      state.facing = "down";
      state.walk = 0;

      // A mãe fica abaixo dele, com espaço suficiente para não sobrepor
      // sprite nem sombra. A hitbox impede que um atravesse o outro.
      prepareMother();
      state.mother.x = 636;
      state.mother.y = 126;
      state.mother.facing = "up";
      state.mother.walk = 0;
      state.mother.targetX = 636;
      state.mother.targetY = 126;
      state.mother.think = 999;
      state.mother.pause = 999;
      state.mother.lastFatherX = state.x;
      state.mother.lastFatherY = state.y;

      say(
        [
          ["Pai", "Vamos comprar as coisas rápido e já voltar."],
          ["Mãe", "Vamos. Não deve demorar."],
          ["Pai", "Se precisar de alguma coisa, manda mensagem."]
        ],
        () => fade(
          "",
          "",
          () => {
            // A passagem para 23:00 também ocorre com a tela preta.
            state.day = 0;
            state.minutes = 1380;
            state.dawnCollapseArmed = false;

            if (state.dawnCollapse) {
              state.dawnCollapse.active = false;
              state.dawnCollapse.phase = "idle";
              state.dawnCollapse.time = 0;
            }

            if (state.wakeUp) {
              state.wakeUp.active = false;
              state.wakeUp.time = 0;
            }

            state.stage = "parents";
            state.room = "bedroom";
            state.x = housePoint(180);
            state.y = housePoint(235);
            state.facing = "down";
            state.walk = 0;
            delete state.mother;

            keys.clear();
            near = null;

            updateHud();
          }
        )
      );
    }
  );
}

const v0639UpdateBase = update;
update = function(dt) {
  v0640RecoverInputLock();
  v0639UpdateBase(dt);

  if (!state || mode !== "game") return;

  // Fade preto saindo devagar antes da animação de levantar.
  if (state.wakeUp?.active && state.wakeUp.time < 0.85) {
    return;
  }

  if (
    state.room === "village" &&
    !dialog &&
    !transitionBusy &&
    $("overlay").hidden
  ) {
    const north = keys.has("w") || keys.has("arrowup");
    const west = keys.has("a") || keys.has("arrowleft");
    const east = keys.has("d") || keys.has("arrowright");

    // Norte: mercado em outro mapa. No prólogo, chegar aqui conclui
    // o trajeto dos pais; depois fica bloqueado por enquanto.
    if (state.y <= 64 && north) {
      state.y = 64;

      if (state.stage === "prologue") {
        v0639FinishPrologueAtNorth();
      } else if (v0648Chapter2Unlocked()) {
        v0648GoMarket();
      } else {
        v0639EdgeNotice("Ainda preciso resolver o que aconteceu perto de casa.");
      }
    }

    // Oeste: Rua Sem Luz. Só abre no Capítulo 4 e exige lanterna.
    if (state.x <= 24 && west) {
      state.x = 26;

      if (v0649Chapter4Unlocked()) {
        if (state.flashlight?.owned) {
          v0649GoWestRoad();
        } else {
          v0639EdgeNotice("Sem uma lanterna eu não consigo seguir por essa rua.");
        }
      } else {
        v0639EdgeNotice("Ainda não tenho motivo para seguir por aqui.");
      }
    }

    // Leste: a praça existe desde o início, mas a história só manda
    // Estevão para lá depois da confirmação no mercado, no Capítulo 2.
    if (state.x >= maps.village.w - 24 && east) {
      state.x = maps.village.w - 26;

      if (!v0648Chapter2Unlocked()) {
        v0639EdgeNotice(
          "A praça fica por ali. Agora preciso resolver o que aconteceu perto de casa."
        );
      } else if (!state.storyFlags?.marketParentsConfirmed) {
        v0639EdgeNotice(
          "A praça fica a leste. Primeiro vou confirmar no mercado se meus pais realmente passaram por lá."
        );
      } else {
        v0648GoSquare();
      }
    }

    // Sul permanece livre dentro deste mapa e vira estrada de terra.
  }

  // Perigo sem barra: só avisos, podendo coexistir com fome e outros eventos.
  const phase = state.danger?.phase || "safe";

  if (v0639LastDangerPhase === null) {
    v0639LastDangerPhase = phase;
  } else if (phase !== v0639LastDangerPhase) {
    const dangerMessages = {
      yellow: "Tem alguma coisa estranha perto de casa.",
      orange: "Ouvi movimento perto da entrada.",
      red: "Alguém entrou. Meu irmão pode estar em perigo.",
      critical: "Preciso voltar para casa agora.",
      lost: "Cheguei tarde demais."
    };

    if (dangerMessages[phase]) {
      v06Toast(dangerMessages[phase], phase === "critical" ? 2.4 : 2);
    }

    v0639LastDangerPhase = phase;
  }
};

const v0639DrawWorldBase = drawWorld;
drawWorld = function() {
  v0639DrawWorldBase();

  // Durante o despertar, o quarto já está atrás da tela preta.
  // O preto some lentamente antes de o personagem começar a levantar.
  if (state?.wakeUp?.active && state.wakeUp.time < 0.85) {
    const alpha = Math.max(0, 1 - state.wakeUp.time / 0.85);
    rect(0, 0, W, H, `rgba(0,0,0,${alpha})`);
  }
};

// =========================================================
// 0.6.42 — RECUPERA SPAWN PÓS-PRÓLOGO E MOVIMENTO
// =========================================================

let v0642PostPrologueRepairDone = false;

function v0642RepairBrokenPostPrologueState() {
  if (!state || mode !== "game") return;

  const shouldBeInBedroom =
    state.stage !== "prologue" &&
    state.day === 0 &&
    state.minutes >= 1380 &&
    state.minutes < 1440 &&
    state.room === "village";

  if (shouldBeInBedroom) {
    state.room = "bedroom";
    state.x = housePoint(180);
    state.y = housePoint(235);
    state.facing = "down";
    state.walk = 0;

    if (state.dawnCollapse) {
      state.dawnCollapse.active = false;
      state.dawnCollapse.phase = "idle";
      state.dawnCollapse.time = 0;
    }

    if (state.wakeUp) {
      state.wakeUp.active = false;
      state.wakeUp.time = 0;
    }

    transitionBusy = false;
    dialog = null;
    $("dialog").hidden = true;
    $("overlay").hidden = true;
    $("transition").classList.remove("active");
    $("transition").style.opacity = "";

    keys.clear();
    near = null;

    updateHud();
    save();
  }

  v0642PostPrologueRepairDone = true;
}

const v0642MovementBase = update;
update = function(dt) {
  v0642RepairBrokenPostPrologueState();

  if (!state) {
    v0642MovementBase(dt);
    return;
  }

  const beforeX = state.x;
  const beforeY = state.y;

  const left = keys.has("a") || keys.has("arrowleft");
  const right = keys.has("d") || keys.has("arrowright");
  const up = keys.has("w") || keys.has("arrowup");
  const down = keys.has("s") || keys.has("arrowdown");

  const wantedDx = (right ? 1 : 0) - (left ? 1 : 0);
  const wantedDy = (down ? 1 : 0) - (up ? 1 : 0);

  v0642MovementBase(dt);

  if (
    mode !== "game" ||
    dialog ||
    transitionBusy ||
    !$("overlay").hidden ||
    state.gameOver ||
    state.dawnCollapse?.active ||
    state.wakeUp?.active
  ) {
    return;
  }

  // Se o pipeline antigo não moveu o personagem apesar de existir
  // uma tecla direcional pressionada, aplica o deslocamento aqui.
  if (
    (wantedDx || wantedDy) &&
    Math.abs(state.x - beforeX) < 0.001 &&
    Math.abs(state.y - beforeY) < 0.001
  ) {
    const len = Math.hypot(wantedDx, wantedDy) || 1;
    const speed =
      state.oldManEvent?.runUnlocked &&
      (keys.has("shift") || keys.has("f"))
        ? 150
        : 90;
    const dx = wantedDx / len * speed * dt;
    const dy = wantedDy / len * speed * dt;

    if (!solid(state.x + dx, state.y)) {
      state.x += dx;
    }

    if (!solid(state.x, state.y + dy)) {
      state.y += dy;
    }

    if (Math.abs(state.x - beforeX) > 0.001 || Math.abs(state.y - beforeY) > 0.001) {
      state.walk += dt * 13;
      state.facing =
        Math.abs(wantedDx) > Math.abs(wantedDy)
          ? (wantedDx > 0 ? "right" : "left")
          : (wantedDy > 0 ? "down" : "up");
    }
  }
};

// =========================================================
// 0.6.45 — INVENTÁRIO, EVENTOS, DEBUG E AJUSTES DE FLUXO
// =========================================================

const v0645PrepareBase = prepareSystems;
prepareSystems = function() {
  v0645PrepareBase();

  if (!state) return;

  // Remove a antiga missão em que um homem pedia para atacar outro.
  if (state.westMission) {
    state.westMission.status = "disabled";
    state.westMission.targetHp = 0;
  }

  // Saves antigos que chegaram às fases da câmera/livro voltam
  // para o fluxo simples de pistas.
  if (state.investigation) {
    const q = state.investigation;

    if (["chest", "camera", "done"].includes(q.phase)) {
      q.phase = q.clues?.length >= 3 ? "cluesDone" : "clues";
    }

    q.camera = false;
    q.photo = null;
  }

  if (!state.randomEventState || typeof state.randomEventState !== "object") {
    state.randomEventState = {
      pending: false,
      timer: 0,
      type: null
    };
  }

  if (!Number.isFinite(state.hungerActiveSeconds)) {
    state.hungerActiveSeconds = 0;
  }
};

// A invasão deixa de nascer automaticamente em todo passeio.
// Ela passa a ser apenas uma das possibilidades do sistema aleatório.
const v0645DangerBase = updateDanger;
updateDanger = function(dt) {
  if (state?.danger?.phase === "safe") {
    state.danger.cooldown = 999999;
  }

  v0645DangerBase(dt);
};

function v0645ClueName(id) {
  return {
    list: "Lista de mantimentos",
    photo: "Fotografia da família",
    note: "Bilhete dos pais"
  }[id] || id;
}

function v0645OpenInventory() {
  prepareSystems();

  modal(
    "Inventário",
    "",
    [["Fechar", closeModal]]
  );

  const root = $("modalText");
  root.replaceChildren();

  const status = document.createElement("p");
  status.textContent =
    "Porção: " + state.food + "/1 · Fome do irmão: " +
    Math.round(state.brotherFood) + "%";
  root.append(status);

  const itemsTitle = document.createElement("strong");
  itemsTitle.textContent = "ITENS";
  root.append(itemsTitle);

  const items = document.createElement("div");
  items.style.display = "grid";
  items.style.gap = "8px";
  items.style.margin = "10px 0 18px";

  const itemNames = [];
  if (state.key) itemNames.push("Chave reserva");
  if (state.food > 0) itemNames.push("Porção de comida");
  if (state.flashlight?.owned) {
    itemNames.push(
      "Lanterna · " +
      Math.ceil(state.flashlight.battery) +
      "%"
    );
  }
  if (state.chapter6?.notebookRead) {
    itemNames.push("Caderno do pai");
  }
  if (state.neighborKey) {
    itemNames.push("Chave de Florinda");
  }

  if (!itemNames.length) {
    itemNames.push("Nenhum item carregado.");
  }

  for (const label of itemNames) {
    const row = document.createElement("div");
    row.textContent = "• " + label;
    items.append(row);
  }

  root.append(items);

  const clueTitle = document.createElement("strong");
  clueTitle.textContent = "PISTAS";
  root.append(clueTitle);

  const q = chapter();
  const clueBox = document.createElement("div");
  clueBox.style.display = "grid";
  clueBox.style.gap = "8px";
  clueBox.style.marginTop = "10px";

  if (!q?.clues?.length) {
    const none = document.createElement("div");
    none.textContent = "Nenhuma pista coletada.";
    clueBox.append(none);
  } else {
    for (const id of q.clues) {
      if (!["list", "photo", "note"].includes(id)) continue;

      const button = document.createElement("button");
      button.textContent = v0645ClueName(id);

      button.onclick = () => {
        modal(
          v0645ClueName(id),
          clueText[id],
          [
            ["Voltar ao inventário", v0645OpenInventory],
            ["Fechar", closeModal]
          ]
        );
      };

      clueBox.append(button);
    }
  }

  root.append(clueBox);
}

// O antigo atalho do diário agora abre apenas o inventário.
openJournal = function() {
  v0645OpenInventory();
};

function v0645ResetTransientState() {
  transitionBusy = false;
  dialog = null;
  $("dialog").hidden = true;
  $("overlay").hidden = true;
  $("transition").classList.remove("active");

  if (state?.danger) {
    state.danger.phase = "safe";
    state.danger.time = 0;
    state.danger.enemy = null;
    state.danger.cooldown = 999999;
    state.danger.punch = 0;
  }

  if (state?.dawnCollapse) {
    state.dawnCollapse.active = false;
    state.dawnCollapse.phase = "idle";
    state.dawnCollapse.time = 0;
  }

  if (state?.wakeUp) {
    state.wakeUp.active = false;
    state.wakeUp.time = 0;
  }

  keys.clear();
  near = null;
}

function v0645RunDevCommand(raw) {
  const command = String(raw || "").trim().toLowerCase();

  if (!command) return;

  if (command === "noite1") {
    state = initial();
    state.familyFarewell = true;
    state.stage = "parents";
    state.day = 0;
    state.minutes = 1380;
    state.room = "bedroom";
    state.x = housePoint(180);
    state.y = housePoint(235);
    state.facing = "down";
    state.walk = 0;
    state.firstExit = false;
    state.key = false;
    state.food = 0;
    delete state.mother;

    prepareSystems();
    v0645ResetTransientState();
    enterGame();
    updateHud();
    save();
    v06Toast("TESTE: primeira noite carregada", 2);
    return;
  }

  if (command === "amanhecer") {
    prepareSystems();
    state.stage = state.stage === "prologue" ? "free" : state.stage;
    state.day = Math.max(1, state.day || 1);
    state.minutes = 410;
    state.firstExit = true;
    state.dawnCollapseArmed = true;
    state.room = "village";
    state.x = 442;
    state.y = 742;
    v0645ResetTransientState();
    updateHud();
    save();
    v06Toast("TESTE: 06:50 do Dia " + state.day, 2);
    return;
  }

  if (command.startsWith("fome ")) {
    const value = Number(command.slice(5).trim());

    if (Number.isFinite(value)) {
      prepareSystems();
      state.brotherFood = Math.max(0, Math.min(100, value));
      updateHud();
      save();
      v06Toast("TESTE: fome = " + Math.round(state.brotherFood) + "%", 2);
    }
    return;
  }

  if (command === "pistas") {
    prepareSystems();
    const q = chapter();
    q.phase = "clues";
    q.clues = [];
    state.room = "parents";
    state.x = housePoint(320);
    state.y = housePoint(280);
    v0645ResetTransientState();
    updateHud();
    save();
    v06Toast("TESTE: coleta de pistas", 2);
    return;
  }

  if (command === "casa") {
    state.room = "bedroom";
    state.x = housePoint(180);
    state.y = housePoint(235);
    v0645ResetTransientState();
    updateHud();
    save();
    return;
  }

  if (command === "vila") {
    state.room = "village";
    state.x = 442;
    state.y = 742;
    v0645ResetTransientState();
    updateHud();
    save();
    return;
  }

  v06Toast("Comando desconhecido", 1.8);
}

function v0645OpenDevPanel() {
  modal(
    "Painel de código / teste",
    "",
    [["Fechar", closeModal]]
  );

  const root = $("modalText");
  root.replaceChildren();

  const info = document.createElement("pre");
  info.textContent =
    "COMANDOS\n" +
    "noite1      → primeira noite, prólogo concluído\n" +
    "amanhecer   → Dia 1 às 06:50\n" +
    "fome 55     → altera a fome do irmão\n" +
    "pistas      → vai direto para a coleta de pistas\n" +
    "casa        → teleporta para o quarto\n" +
    "vila        → teleporta para o bairro";
  info.style.whiteSpace = "pre-wrap";
  root.append(info);

  const input = document.createElement("input");
  input.type = "text";
  input.placeholder = "Digite um comando...";
  input.autocomplete = "off";
  input.style.width = "100%";
  input.style.boxSizing = "border-box";
  input.style.marginTop = "12px";
  input.style.padding = "10px";
  input.style.background = "#0b1116";
  input.style.color = "#e1d5b8";
  input.style.border = "1px solid #7f7358";

  const run = document.createElement("button");
  run.textContent = "Executar";
  run.style.marginTop = "10px";

  const execute = () => {
    const value = input.value;
    closeModal();
    v0645RunDevCommand(value);
  };

  run.onclick = execute;
  input.addEventListener("keydown", event => {
    if (event.key === "Enter") {
      event.preventDefault();
      execute();
    }
  });

  root.append(input, run);

  setTimeout(() => input.focus(), 0);
}

const v0645DevKeys = new Set();

window.addEventListener("keydown", event => {
  const key = event.key.toLowerCase();

  if (key === "x" || key === "y") {
    v0645DevKeys.add(key);

    if (
      v0645DevKeys.has("x") &&
      v0645DevKeys.has("y") &&
      mode === "game" &&
      state &&
      $("overlay").hidden &&
      !dialog &&
      !transitionBusy
    ) {
      event.preventDefault();
      v0645OpenDevPanel();
    }
  }

  if (
    key === "i" &&
    !event.repeat &&
    mode === "game" &&
    state &&
    !dialog &&
    !transitionBusy &&
    $("overlay").hidden
  ) {
    event.preventDefault();
    v0645OpenInventory();
  }
}, true);

window.addEventListener("keyup", event => {
  const key = event.key.toLowerCase();

  if (key === "x" || key === "y") {
    v0645DevKeys.delete(key);
  }
}, true);

// Agenda exatamente um evento quando o jogador sai da própria casa.
function v0645ScheduleOutingEvent() {
  prepareSystems();

  const pool = [
    "van",
    "voices",
    "knock",
    "blackout"
  ];

  if (state.finished) {
    pool.push("invasion");
  }

  state.randomEventState.pending = true;
  state.randomEventState.timer = 7 + Math.random() * 9;
  state.randomEventState.type =
    pool[Math.floor(Math.random() * pool.length)];

  save();
}

let v0645VanVisibleUntil = 0;
let v0645BlackoutUntil = 0;

function v0645TriggerRandomEvent() {
  prepareSystems();

  const event = state.randomEventState;

  if (!event?.pending) return;

  event.pending = false;

  if (event.type === "van") {
    state.storyEvents.vanSightings += 1;
    v0645VanVisibleUntil = elapsed + 12;
    v06Toast("Uma van preta parou perto da sua casa.", 2.4);

    state.pendingBrotherRemark =
      "Eu ouvi um carro parando lá fora. Depois ele foi embora.";
  } else if (event.type === "voices") {
    v06Toast("Alguém sussurrou seu nome atrás de você.", 2.4);

    state.pendingBrotherRemark =
      "Eu também ouvi uma voz. Achei que era você.";
  } else if (event.type === "knock") {
    v06Toast("Ouvi batidas vindo da direção de casa.", 2.4);

    state.pendingBrotherRemark =
      "Alguém bateu na porta enquanto você estava fora.";
  } else if (event.type === "blackout") {
    v0645BlackoutUntil = elapsed + 3.2;
    v06Toast("As luzes da rua apagaram de uma vez.", 2.4);

    state.pendingBrotherRemark =
      "As luzes piscaram aqui dentro também.";
  } else if (
    event.type === "invasion" &&
    state.danger?.phase === "safe"
  ) {
    v06Toast("Tem alguém se aproximando da casa.", 2.4);
    startInvasion();

    state.pendingBrotherRemark =
      "Eu ouvi passos perto da entrada.";
  }

  save();
}

const v0645GoBase = go;
go = function(nextRoom, x, y) {
  const leavingHome =
    state &&
    state.room === "foyer" &&
    nextRoom === "village" &&
    state.stage !== "prologue";

  const returningHome =
    state &&
    state.room === "village" &&
    nextRoom === "foyer";

  v0645GoBase(nextRoom, x, y);

  if (leavingHome) {
    v0645ScheduleOutingEvent();
  }

  if (returningHome && state?.randomEventState) {
    state.randomEventState.pending = false;
  }
};

const v0645GetNearBase = getNear;
getNear = function() {
  const target = v0645GetNearBase();

  if (
    target?.action?.startsWith("clue:")
  ) {
    const id = target.action.slice(5);
    const q = chapter();

    if (
      !["list", "photo", "note"].includes(id) ||
      q.clues.includes(id)
    ) {
      return null;
    }

    return {
      ...target,
      label: "Coletar pista"
    };
  }

  return target;
};

const v0645InteractBase = interact;
interact = function(action) {
  prepareSystems();

  if (action === "policeOfficer") {
    say(
      [["Policial", "O que houve?"]],
      v0630OpenPoliceTopics
    );
    return;
  }

  if (
    action === "vendor" &&
    state.brotherFood >= 60
  ) {
    say([
      ["Florinda", "Se precisar de comida mais tarde, bate aqui."],
      ["Você", "Por enquanto ele está bem. Não preciso levar nada."]
    ]);
    return;
  }

  if (
    action === "brother" &&
    state.pendingBrotherRemark
  ) {
    const remark = state.pendingBrotherRemark;
    state.pendingBrotherRemark = "";

    say(
      [["Irmão", remark]],
      save
    );
    return;
  }

  if (action?.startsWith("clue:")) {
    const id = action.slice(5);

    if (["list", "photo", "note"].includes(id)) {
      const q = chapter();

      if (!q.clues.includes(id)) {
        q.clues.push(id);

        v06Toast(
          "Pista coletada: " + v0645ClueName(id),
          2.2
        );

        if (q.clues.length >= 3) {
          q.phase = "cluesDone";
        }

        updateHud();
        save();
      }

      return;
    }
  }

  v0645InteractBase(action);
};

const v0645UpdateHudBase = updateHud;
updateHud = function() {
  v0645UpdateHudBase();

  if (!state) return;

  const q = state.investigation;

  $("inventory").textContent =
    "PORÇÃO " + state.food + "/1" +
    " · FOME " + Math.round(state.brotherFood) + "%" +
    (state.key ? " · CHAVE RESERVA" : "") +
    (q?.clues?.length ? " · PISTAS " + q.clues.length + "/3" : "");

  if (q?.phase === "clues") {
    $("objective").textContent =
      "Colete as pistas no quarto dos seus pais: " +
      q.clues.length + "/3.";
  } else if (q?.phase === "cluesDone") {
    $("objective").textContent =
      "As pistas foram guardadas no inventário.";
  }
};

const v0645UpdateBase = update;
update = function(dt) {
  prepareSystems();

  v0645UpdateBase(dt);

  if (
    !state ||
    mode !== "game" ||
    dialog ||
    transitionBusy ||
    !$("overlay").hidden ||
    state.gameOver
  ) {
    return;
  }

  // Às 07:00 o relógio para imediatamente e o desmaio começa.
  if (
    state.stage !== "prologue" &&
    state.day >= 1 &&
    state.minutes >= 420 &&
    !state.dawnCollapse?.active &&
    !state.wakeUp?.active
  ) {
    state.minutes = 420;
    state.dawnCollapseArmed = true;
    v0632StartDawnCollapse();
    return;
  }

  // Fome: -5 pontos a cada 60 segundos REAIS de jogo ativo,
  // começando somente depois da primeira saída de casa.
  if (
    state.firstExit &&
    !state.dawnCollapse?.active &&
    !state.wakeUp?.active
  ) {
    state.hungerActiveSeconds += dt;
    state.brotherFood = Math.max(
      0,
      state.brotherFood - dt * (5 / 60)
    );

    if (state.brotherFood <= 0) {
      v06TriggerHungerDefeat();
      return;
    }
  }

  const randomEvent = state.randomEventState;

  if (
    randomEvent?.pending &&
    state.room === "village" &&
    state.danger?.phase === "safe"
  ) {
    randomEvent.timer -= dt;

    if (randomEvent.timer <= 0) {
      v0645TriggerRandomEvent();
    }
  }

  updateHud();
};

const v0645DrawWorldBase = drawWorld;
drawWorld = function() {
  v0645DrawWorldBase();

  if (!state) return;

  if (
    state.room === "village" &&
    elapsed < v0645VanVisibleUntil
  ) {
    c.save();
    c.translate(
      -Math.floor(camera.x),
      -Math.floor(camera.y)
    );

    const x = 525;
    const y = 790;

    rect(x, y, 54, 22, "#111416");
    rect(x + 8, y - 10, 31, 12, "#161a1d");
    rect(x + 12, y - 7, 11, 7, "#29333a");
    rect(x + 26, y - 7, 10, 7, "#29333a");
    rect(x + 7, y + 18, 10, 7, "#090b0d");
    rect(x + 38, y + 18, 10, 7, "#090b0d");

    c.restore();
  }

  if (elapsed < v0645BlackoutUntil) {
    rect(0, 0, W, H, "rgba(2,4,7,0.72)");
  }
};

$("help").onclick = () => modal(
  "Como jogar",
  "WASD / setas: andar. Shift/F: correr quando disponível. E: interagir. I: inventário. Esc: pausar. ESPAÇO: soco perto de uma ameaça.\n\nA fome do irmão começa a cair depois da primeira saída e perde 5 pontos por minuto real de jogo ativo. A vizinha só entrega outra porção quando a fome estiver abaixo de 60%.\n\nSair de casa pode gerar acontecimentos diferentes. Nem todos são ataques; observe os avisos e converse com seu irmão depois.\n\nÀs 07:00, depois da primeira meia-noite, o protagonista perde os sentidos.",
  [["Voltar", closeModal]]
);

// =========================================================
// 0.6.46 — ESTRADA DO VELHO / ÁREA SUL SEPARADA
// =========================================================

const v0646PrepareBase = prepareSystems;
prepareSystems = function() {
  v0646PrepareBase();

  if (!state) return;

  if (!state.oldManEvent || typeof state.oldManEvent !== "object") {
    state.oldManEvent = {
      phase: "waiting",
      x: 625,
      y: 785,
      runUnlocked: false,
      counted: false,
      caught: false
    };
  }

  if (!Number.isFinite(state.oldManEvent.x)) state.oldManEvent.x = 625;
  if (!Number.isFinite(state.oldManEvent.y)) state.oldManEvent.y = 785;
  if (typeof state.oldManEvent.runUnlocked !== "boolean") state.oldManEvent.runUnlocked = false;
  if (typeof state.oldManEvent.counted !== "boolean") state.oldManEvent.counted = false;
  if (typeof state.oldManEvent.caught !== "boolean") state.oldManEvent.caught = false;

  // A missão antiga do oeste continua definitivamente desativada.
  if (state.westMission) {
    state.westMission.status = "disabled";
    state.westMission.targetHp = 0;
  }
};

function v0646CountOldManEncounter() {
  prepareSystems();

  if (state.oldManEvent.counted) return;

  state.oldManEvent.counted = true;
  state.storyEvents.oldManEncounters += 1;
  save();
}

function v0646GoOldRoad() {
  prepareSystems();

  fade(
    "Estrada de terra",
    "",
    () => {
      state.room = "oldRoad";
      state.x = 468;
      state.y = 92;
      state.facing = "down";
      state.walk = 0;

      keys.clear();
      near = null;
      updateHud();
    }
  );
}

function v0646ReturnVillage() {
  prepareSystems();

  fade(
    "",
    "",
    () => {
      state.room = "village";
      state.x = 650;
      state.y = maps.village.h - 76;
      state.facing = "up";
      state.walk = 0;

      keys.clear();
      near = null;
      updateHud();
    }
  );
}

function v0646StartOldManChoice() {
  prepareSystems();

  say(
    [
      ["Raimundo", "Tá tarde para um garoto andar sozinho por esta estrada."],
      ["Você", "O senhor conhece meus pais?"],
      ["Raimundo", "Conheço o suficiente. Seu sobrenome já diz bastante, pra quem sabe ouvir."],
      ["Você", "Como assim?"],
      ["Raimundo", "Não vou te encher a cabeça com coisa que eu mesmo não sei explicar."],
      ["Raimundo", "Só não entre na mata sem luz. E, se vir alguma coisa parada onde não devia estar, corre. Não chega perto."]
    ],
    () => {
      state.oldManEvent.phase = "helped";
      state.oldManEvent.runUnlocked = true;
      state.oldManEvent.caught = false;

      if (!state.storyFlags || typeof state.storyFlags !== "object") {
        state.storyFlags = {};
      }
      state.storyFlags.raimundoMet = true;

      v0646CountOldManEncounter();

      v06Toast(
        "Corrida liberada · segure Shift ou F",
        3
      );

      updateHud();
      save();
    }
  );
}

// Compatibilidade defensiva com saves muito antigos que ainda tragam
// o estado "chase". Raimundo não persegue mais Estevão.
function v0646OldManCaught() {
  prepareSystems();

  state.oldManEvent.phase = "helped";
  state.oldManEvent.caught = false;
  state.oldManEvent.runUnlocked = true;

  if (!state.storyFlags || typeof state.storyFlags !== "object") {
    state.storyFlags = {};
  }
  state.storyFlags.raimundoMet = true;

  updateHud();
  save();
}

const v0646GetNearBase = getNear;
getNear = function() {
  prepareSystems();

  // Fim da estrada de terra no bairro principal.
  if (
    state?.room === "village" &&
    state.stage !== "prologue" &&
    state.y >= maps.village.h - 88 &&
    state.x >= 585 &&
    state.x <= 715
  ) {
    return {
      label: "Avançar",
      action: "oldRoadAdvance"
    };
  }

  if (state?.room === "oldRoad") {
    // Volta pelo mesmo caminho.
    if (
      state.y <= 92 &&
      state.x >= 405 &&
      state.x <= 535
    ) {
      return {
        label: "Voltar para o bairro",
        action: "oldRoadBack"
      };
    }

    if (
      state.oldManEvent.phase === "waiting" &&
      Math.hypot(
        state.x - 625,
        state.y - 785
      ) < 50
    ) {
      return {
        label: "Falar com o senhor",
        action: "oldManTalk"
      };
    }
  }

  return v0646GetNearBase();
};

const v0646InteractBase = interact;
interact = function(action) {
  prepareSystems();

  if (action === "oldRoadAdvance") {
    v0646GoOldRoad();
    return;
  }

  if (action === "oldRoadBack") {
    v0646ReturnVillage();
    return;
  }

  if (action === "oldManTalk") {
    if (state.oldManEvent.phase === "waiting") {
      v0646StartOldManChoice();
    } else {
      say([
        ["Raimundo", "Se for continuar por aqui, não saia da estrada sem uma luz."]
      ]);
    }

    return;
  }

  v0646InteractBase(action);
};

function v0646ApplyOutdoorLight() {
  const lightMinutes =
    ((state.minutes % 1440) + 1440) % 1440;

  let night = 0.03;

  if (lightMinutes < 300) {
    night = 0.34;
  } else if (lightMinutes < 420) {
    const p = (lightMinutes - 300) / 120;
    night = 0.34 - p * 0.29;
  } else if (lightMinutes < 1020) {
    night = 0.03;
  } else if (lightMinutes < 1260) {
    const p = (lightMinutes - 1020) / 240;
    night = 0.03 + p * 0.29;
  } else {
    night = 0.34;
  }

  rect(0, 0, W, H, `rgba(6,16,37,${night})`);
}

function v0646DrawOldRoad() {
  const m = maps.oldRoad;

  camera.x = Math.max(
    0,
    Math.min(m.w - W, state.x - W / 2)
  );

  camera.y = Math.max(
    0,
    Math.min(m.h - H, state.y - H / 2)
  );

  c.save();
  c.translate(
    -Math.floor(camera.x),
    -Math.floor(camera.y)
  );

  // Terreno.
  rect(0, 0, m.w, m.h, "#273d32");

  for (let y = 0; y < m.h; y += 18) {
    for (let x = 0; x < m.w; x += 22) {
      const z = hash(x + 17, y + 91);

      if (z > 0.72) {
        rect(
          x,
          y,
          z > 0.86 ? 4 : 2,
          2,
          z > 0.84 ? "#566849" : "#1f342d"
        );
      }
    }
  }

  // Estrada principal, um pouco irregular.
  rect(425, 0, 94, 480, "#665442");
  rect(442, 450, 108, 320, "#665442");
  rect(478, 735, 170, 86, "#665442");

  // Trilha até a casa.
  rect(615, 775, 110, 74, "#665442");

  // Marcas de roda e terra mais clara.
  for (let y = 18; y < 730; y += 34) {
    const drift = Math.sin(y * 0.05) * 8;
    rect(448 + drift, y, 13, 4, "#796650");
    rect(493 + drift, y + 12, 11, 3, "#514234");
  }

  // Cerca baixa perto da casa.
  for (let x = 525; x < 850; x += 34) {
    rect(x, 745, 4, 34, "#554538");
  }
  rect(525, 756, 325, 5, "#6b5844");

  // Árvores emoldurando o caminho, sem fechar a estrada.
  for (let i = 0; i < 34; i++) {
    const side = i % 2 === 0 ? 1 : -1;
    const y = 70 + i * 31;
    const baseX =
      side < 0
        ? 270 + hash(i, 33) * 110
        : 640 + hash(i, 44) * 120;

    if (y > 760 && baseX > 520) continue;

    rect(baseX, y, 8, 35, "#493c31");
    rect(baseX - 20, y - 24, 48, 35, "#1e352b");
    rect(baseX - 13, y - 34, 34, 31, "#2c4a38");
  }

  // Casa isolada. O gatilho da mina tem desenho próprio.
  for (const o of m.objects) {
    if (o.type !== "mineTrigger") {
      building(o);
    }
  }

  // Raimundo permanece perto da casa. A versão atual não usa perseguição.
  {
    const ox = 625;
    const oy = 785;

    person(
      ox,
      oy,
      "npcMale",
      0,
      "left",
      0.92
    );

    txt(
      state.oldManEvent.phase === "waiting" ? "SENHOR" : "RAIMUNDO",
      ox - (state.oldManEvent.phase === "waiting" ? 21 : 31),
      oy - 37,
      "#b8aa8d",
      7
    );
  }

  // Entrada externa da antiga mina, parcialmente soterrada.
  // O interior continua inacessível nesta fase da história.
  const mineX = 135;
  const mineY = 760;

  rect(280, 780, 180, 30, "#5d4c3d");
  rect(205, 770, 90, 38, "#5d4c3d");
  rect(mineX - 24, mineY - 28, 210, 120, "#223329");
  rect(mineX, mineY, 170, 88, "#3c413c");
  rect(mineX + 18, mineY + 18, 134, 62, "#0b0d0e");

  // Estruturas e destroços do colapso.
  rect(mineX + 9, mineY + 4, 9, 82, "#4a3c31");
  rect(mineX + 151, mineY + 4, 9, 82, "#4a3c31");
  rect(mineX + 6, mineY + 6, 157, 9, "#59483a");
  rect(mineX + 46, mineY + 56, 82, 12, "#4b443b");
  rect(mineX + 72, mineY + 35, 16, 47, "#51473d");

  for (let i = 0; i < 10; i++) {
    const rx = mineX - 10 + hash(i, 71) * 190;
    const ry = mineY + 62 + hash(i, 72) * 35;
    rect(rx, ry, 14 + hash(i, 73) * 18, 8 + hash(i, 74) * 10, "#57554a");
  }

  txt("MINA DESATIVADA", mineX + 18, mineY - 10, "#a69b80", 8);

  // Player.
  person(
    state.x,
    state.y,
    "player",
    state.walk,
    state.facing
  );

  c.restore();

  v0646ApplyOutdoorLight();

}

const v0646DrawWorldBase = drawWorld;
drawWorld = function() {
  if (state?.room === "oldRoad") {
    v0646DrawOldRoad();
    return;
  }

  v0646DrawWorldBase();
};

const v0646UpdateBase = update;
update = function(dt) {
  v0646UpdateBase(dt);
};

const v0646DevCommandBase = v0645RunDevCommand;
v0645RunDevCommand = function(raw) {
  const command = String(raw || "").trim().toLowerCase();

  if (command === "raimundo" || command === "velho") {
    prepareSystems();

    state.stage =
      state.stage === "prologue"
        ? "free"
        : state.stage;

    state.day = Math.max(1, state.day || 1);
    state.room = "oldRoad";
    state.x = 468;
    state.y = 180;
    state.facing = "down";
    state.walk = 0;

    state.oldManEvent.phase = "waiting";
    state.oldManEvent.x = 625;
    state.oldManEvent.y = 785;
    state.oldManEvent.runUnlocked = false;
    state.oldManEvent.caught = false;

    v0645ResetTransientState();
    updateHud();
    save();
    v06Toast("TESTE: estrada de Raimundo", 2);
    return;
  }

  v0646DevCommandBase(raw);
};

// Inclui o novo comando no painel de teste.
const v0646DevPanelBase = v0645OpenDevPanel;
v0645OpenDevPanel = function() {
  v0646DevPanelBase();

  const root = $("modalText");
  const pre = root.querySelector("pre");

  if (pre && !pre.textContent.includes("raimundo")) {
    pre.textContent +=
      "\nraimundo    → vai direto para a estrada de Raimundo";
  }
};

// =========================================================
// 0.6.47 — CORREÇÃO VISUAL DO SOCO / PLAYER INVISÍVEL
// =========================================================

const v0647DrawWorldBase = drawWorld;
drawWorld = function() {
  v0647DrawWorldBase();

  if (
    !state ||
    mode !== "game" ||
    !state.danger ||
    state.danger.punch <= 0 ||
    state.room === "oldRoad"
  ) {
    return;
  }

  // Pequeno impacto em pixels. O personagem continua usando idle,
  // evitando os frames quebrados/transparentes de thrust.png.
  c.save();
  c.translate(
    -Math.floor(camera.x),
    -Math.floor(camera.y)
  );

  const p = Math.max(
    0,
    Math.min(1, 1 - state.danger.punch / 0.45)
  );

  const reach = 15 + p * 6;
  let dx = 0;
  let dy = 0;

  if (state.facing === "left") dx = -reach;
  else if (state.facing === "right") dx = reach;
  else if (state.facing === "up") dy = -reach;
  else dy = reach;

  rect(
    state.x + dx - 4,
    state.y + dy - 12,
    8,
    5,
    "rgba(224,207,171,0.75)"
  );

  rect(
    state.x + dx - 2,
    state.y + dy - 9,
    4,
    3,
    "rgba(255,238,198,0.55)"
  );

  c.restore();
};

// Proteção extra: coordenadas inválidas nunca podem fazer a câmera
// perder o protagonista depois de um combate.
const v0647UpdateBase = update;
update = function(dt) {
  if (state && mode === "game") {
    const m = maps[state.room];

    if (
      !m ||
      !Number.isFinite(state.x) ||
      !Number.isFinite(state.y)
    ) {
      state.room = "village";
      state.x = 442;
      state.y = 742;
      state.facing = "down";
      state.walk = 0;
    }
  }

  v0647UpdateBase(dt);
};

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


// =========================================================
// 0.6.48 — ORDEM DOS CAPÍTULOS, MERCADO/PRAÇA E RAIMUNDO
// =========================================================

// Capítulo 2: mercado ao norte. Reaproveita a base interna já existente.
if (!maps.market) {
  room(
    "market",
    [
      obj(78, 86, 120, 48, "shelf"),
      obj(78, 164, 120, 48, "shelf"),
      obj(438, 86, 92, 48, "shelf"),
      obj(438, 164, 92, 48, "shelf"),
      obj(
        248, 104, 170, 58,
        "counter",
        "Falar com o funcionário",
        "marketClerk"
      )
    ],
    [
      door(
        310, 374,
        "village", 650, 88,
        "Sair do mercado"
      )
    ]
  );
}
roomNames.market = "Mercado de Forgotten";

// Capítulo 2: praça central. É uma área externa própria, não um cômodo.
if (!maps.square) {
  maps.square = {
    w: 1100,
    h: 760,
    objects: [
      obj(410, 250, 150, 150, "fountain"),
      obj(90, 85, 205, 135, "building"),
      obj(760, 80, 220, 140, "building"),
      obj(110, 535, 220, 135, "building"),
      obj(735, 535, 235, 135, "building")
    ],
    doors: []
  };
}
roomNames.square = "Praça central · Forgotten";

// A entrada externa da mina já pode ser vista no Capítulo 3,
// mas nunca permite acesso ao interior.
if (
  maps.oldRoad &&
  !maps.oldRoad.objects.some(o => o.type === "mineTrigger")
) {
  maps.oldRoad.objects.push(
    obj(
      120, 750, 185, 105,
      "mineTrigger",
      "Examinar a entrada da mina",
      "mineExterior"
    )
  );
}

function v0648Chapter2Unlocked() {
  const q = state ? chapter() : null;

  return Boolean(
    state &&
    state.stage !== "prologue" &&
    state.finished &&
    state.day >= 2 &&
    q &&
    q.clues.length >= 3
  );
}

function v0648Chapter3Unlocked() {
  return Boolean(
    v0648Chapter2Unlocked() &&
    state.day >= 4 &&
    state.storyFlags?.marketParentsConfirmed &&
    state.squareManFirstSpeechDone
  );
}

function v0648GoMarket() {
  if (
    !state ||
    transitionBusy ||
    dialog ||
    !v0648Chapter2Unlocked()
  ) {
    return;
  }

  fade(
    "Mercado",
    "Norte de Forgotten",
    () => {
      go("market", 310, 330);
    }
  );
}

function v0648GoSquare() {
  if (
    !state ||
    transitionBusy ||
    dialog ||
    !v0648Chapter2Unlocked() ||
    !state.storyFlags?.marketParentsConfirmed
  ) {
    return;
  }

  fade(
    "Praça central",
    "Leste de Forgotten",
    () => {
      const firstVisit =
        !state.storyFlags.squareVisited;

      state.storyFlags.squareVisited = true;
      state.storyFlags.squareVisitCount =
        (state.storyFlags.squareVisitCount || 0) + 1;

      state.room = "square";
      state.x = 82;
      state.y = 500;
      state.facing = "right";
      state.walk = 0;
      keys.clear();
      near = null;

      if (firstVisit) {
        v06Toast(
          "Praça central · procure alguém que possa ter visto seus pais.",
          2.6
        );
      }

      updateHud();
      save();
    }
  );
}

function v0648ReturnFromSquare() {
  if (!state || transitionBusy || dialog) return;

  fade(
    "",
    "",
    () => {
      state.room = "village";
      state.x = maps.village.w - 58;
      state.y = 424;
      state.facing = "left";
      state.walk = 0;
      keys.clear();
      near = null;
      updateHud();
    }
  );
}

const v0648PrepareBase = prepareSystems;
prepareSystems = function() {
  v0648PrepareBase();

  if (!state) return;

  let migrated = false;

  if (!state.storyFlags || typeof state.storyFlags !== "object") {
    state.storyFlags = {};
  }

  if (typeof state.storyFlags.marketParentsConfirmed !== "boolean") {
    state.storyFlags.marketParentsConfirmed = false;
  }

  if (typeof state.storyFlags.mineExteriorSeen !== "boolean") {
    state.storyFlags.mineExteriorSeen = false;
  }

  if (typeof state.storyFlags.raimundoMet !== "boolean") {
    state.storyFlags.raimundoMet = false;
  }

  if (typeof state.storyFlags.squareVisited !== "boolean") {
    state.storyFlags.squareVisited = false;
  }

  if (!Number.isFinite(state.storyFlags.squareVisitCount)) {
    state.storyFlags.squareVisitCount = 0;
  }

  if (typeof state.storyFlags.squareVendorTalked !== "boolean") {
    state.storyFlags.squareVendorTalked = false;
  }

  if (typeof state.storyFlags.squareEarlyResidentTalked !== "boolean") {
    state.storyFlags.squareEarlyResidentTalked = false;
  }

  if (typeof state.storyFlags.squareCardsTalked !== "boolean") {
    state.storyFlags.squareCardsTalked = false;
  }

  // A Bíblia atual coloca as três pistas no Dia 1.
  // Remove o antigo gatilho que exigia uma invasão antes da investigação.
  const q = chapter();

  if (
    state.stage !== "prologue" &&
    state.day >= 1 &&
    ["waiting", "brother"].includes(q.phase)
  ) {
    q.phase = "clues";
    migrated = true;
  }

  if (q.phase === "cluesDone") {
    q.phase = "complete";
    migrated = true;
  }

  // Migração: saves antigos podem ter Raimundo no papel hostil.
  // A decisão mais recente o torna um aliado desconfiado, não um perseguidor.
  if (
    state.oldManEvent &&
    ["chase", "escaped", "refused"].includes(state.oldManEvent.phase)
  ) {
    state.oldManEvent.phase = "helped";
    state.oldManEvent.caught = false;
    state.oldManEvent.runUnlocked = true;
    state.storyFlags.raimundoMet = true;
    migrated = true;
  }

  if (migrated) {
    save();
  }
};

// O encontro e o diálogo policial já foram corrigidos diretamente
// nos sistemas-base da estrada. A 0.6.48 só cuida da migração de saves.

const v0648GetNearBase = getNear;
getNear = function() {
  prepareSystems();

  const baseTarget = v0648GetNearBase();

  if (
    baseTarget?.action === "oldRoadAdvance" &&
    !v0648Chapter3Unlocked()
  ) {
    return {
      ...baseTarget,
      label: "Estrada ao sul",
      action: "southLocked"
    };
  }

  if (state?.room === "oldRoad") {
    if (
      state.oldManEvent?.phase === "helped" &&
      Math.hypot(state.x - 625, state.y - 785) < 50
    ) {
      return {
        label: "Falar com Raimundo",
        action: "oldManTalk"
      };
    }

    const mine = maps.oldRoad.objects.find(
      o => o.type === "mineTrigger"
    );

    if (mine) {
      const px = Math.max(
        mine.x,
        Math.min(state.x, mine.x + mine.w)
      );
      const py = Math.max(
        mine.y,
        Math.min(state.y, mine.y + mine.h)
      );

      if (Math.hypot(state.x - px, state.y - py) < 48) {
        return {
          ...mine,
          dist: 0
        };
      }
    }
  }

  return baseTarget;
};

const v0648InteractBase = interact;
interact = function(action) {
  prepareSystems();

  if (action === "southLocked") {
    say([
      state.day < 4
        ? "Ainda preciso procurar meus pais nas áreas mais próximas."
        : "Antes de seguir pela estrada do sul, preciso confirmar o que aconteceu no mercado e na praça."
    ]);
    return;
  }

  if (
    action === "oldRoadAdvance" &&
    !v0648Chapter3Unlocked()
  ) {
    say([
      "Ainda não tenho motivo para ir tão longe pela estrada do sul."
    ]);
    return;
  }

  if (action === "marketClerk") {
    if (!state.storyFlags.marketParentsConfirmed) {
      say(
        [
          ["Funcionário", "Você é o filho dos Lancaster, não é?"],
          ["Você", "Meus pais estiveram aqui?"],
          ["Funcionário", "Estiveram. Os dois. Compraram algumas coisas e saíram juntos."],
          ["Você", "Tem certeza?"],
          ["Funcionário", "Tenho. Seu pai ainda perguntou uma coisa sobre a estrada do sul antes de ir embora. Achei estranho, só isso."],
          ["Você", "Alguém pode ter visto pra onde eles foram?"],
          ["Funcionário", "Tenta a praça, a leste. O homem da cadeira costuma ficar lá até tarde e repara em todo mundo."]
        ],
        () => {
          state.storyFlags.marketParentsConfirmed = true;
          v06Toast(
            "Pista confirmada · nova rota: praça central, a leste.",
            2.8
          );
          updateHud();
          save();
        }
      );
    } else {
      say([
        ["Funcionário", "Já te falei o que lembro. Eles vieram juntos e saíram juntos."],
        ["Funcionário", "Depois disso, eu não vi mais nenhum dos dois."]
      ]);
    }

    return;
  }

  if (action === "mineExterior") {
    const firstVisit = !state.storyFlags.mineExteriorSeen;

    state.storyFlags.mineExteriorSeen = true;

    if (firstVisit) {
      state.storyFlags.southObserverPending = true;
    }

    say(
      [
        "Uma antiga mineração, fechada depois de um grave acidente há cerca de 40 anos.",
        "A entrada está parcialmente soterrada. Não há como passar por aqui."
      ],
      save
    );

    return;
  }

  if (
    action === "oldManTalk" &&
    state.oldManEvent?.phase === "helped"
  ) {
    say([
      ["Raimundo", "Aquela mina não é lugar para curiosidade."],
      ["Você", "O que aconteceu lá?"],
      ["Raimundo", "Um desabamento. Quarenta anos atrás. Gente demais ficou debaixo daquela pedra."],
      ["Raimundo", "Se está procurando seus pais, presta atenção no que encontra. Não inventa resposta só porque precisa de uma."]
    ]);
    return;
  }

  v0648InteractBase(action);

  if (
    action?.startsWith("clue:") &&
    chapter().phase === "cluesDone"
  ) {
    chapter().phase = "complete";
    updateHud();
    save();
  }
};

function v0648DrawMarketClerk() {
  c.save();
  c.translate(
    -Math.floor(camera.x),
    -Math.floor(camera.y)
  );

  person(
    housePoint(335),
    housePoint(142),
    "npcMale",
    0,
    "down",
    0.9
  );

  txt(
    "FUNCIONÁRIO",
    housePoint(292),
    housePoint(98),
    "#b8aa8d",
    7
  );

  c.restore();
}

function v0648DrawSquareEnvironment(m) {
  rect(0, 0, m.w, m.h, "#31483b");

  // Calçamento central e caminhos.
  rect(330, 185, 330, 390, "#77746a");
  rect(0, 430, m.w, 86, "#77746a");
  rect(490, 0, 86, m.h, "#77746a");

  for (let y = 195; y < 565; y += 20) {
    for (let x = 340; x < 650; x += 24) {
      const offset = (Math.floor(y / 20) % 2) * 10;
      rect(x + offset, y, 16, 10, "#858177");
    }
  }

  // Árvores e bancos deixam a praça legível como lugar público.
  for (const [tx, ty] of [
    [345, 135], [650, 145], [340, 610], [660, 610],
    [70, 360], [1010, 350]
  ]) {
    rect(tx, ty, 8, 30, "#493f31");
    rect(tx - 17, ty - 19, 42, 30, "#244438");
    rect(tx - 10, ty - 30, 29, 26, "#315441");
  }

  for (const [bx, by] of [
    [370, 420], [600, 420], [425, 545], [570, 545]
  ]) {
    rect(bx, by, 60, 8, "#5d4a38");
    rect(bx + 7, by + 8, 5, 12, "#3f342b");
    rect(bx + 48, by + 8, 5, 12, "#3f342b");
  }

  v071DrawSquareAmbientWorld();

  for (const o of m.objects) {
    building(o);
  }
}

const v0648DrawWorldBase = drawWorld;
drawWorld = function() {
  v0648DrawWorldBase();

  if (state?.room === "market") {
    v0648DrawMarketClerk();
  }
};

const v0648UpdateBase = update;
update = function(dt) {
  prepareSystems();
  v0648UpdateBase(dt);

  if (
    !state ||
    mode !== "game" ||
    dialog ||
    transitionBusy ||
    !$("overlay").hidden ||
    state.gameOver ||
    state.dawnCollapse?.active ||
    state.wakeUp?.active
  ) {
    return;
  }

  const left =
    keys.has("a") ||
    keys.has("arrowleft");

  const down =
    keys.has("s") ||
    keys.has("arrowdown");

  if (
    state.room === "square" &&
    state.x <= 44 &&
    left
  ) {
    state.x = 44;
    v0648ReturnFromSquare();
    return;
  }

  // Antes do Capítulo 3, o extremo sul continua visível,
  // mas Estevão ainda não tem motivo narrativo para seguir.
  if (
    state.room === "village" &&
    state.y >= maps.village.h - 28 &&
    down &&
    !v0648Chapter3Unlocked()
  ) {
    state.y = maps.village.h - 30;
    v0639EdgeNotice(
      state.day < 4
        ? "Ainda preciso procurar meus pais nas áreas mais próximas."
        : "Antes de ir tão longe, preciso confirmar o que aconteceu no mercado e na praça."
    );
  }
};

const v0648UpdateHudBase = updateHud;
updateHud = function() {
  v0648UpdateHudBase();

  if (!state || state.stage === "prologue") return;

  const q = chapter();

  if (
    state.day >= 1 &&
    q.phase === "clues"
  ) {
    $("objective").textContent =
      "Investigue o quarto dos seus pais: " +
      q.clues.length +
      "/3 pistas.";
    return;
  }

  if (
    state.stage === "free" &&
    v0648Chapter2Unlocked() &&
    !state.storyFlags?.marketParentsConfirmed
  ) {
    $("objective").textContent =
      "Vá ao norte e confirme se seus pais chegaram ao mercado.";
    return;
  }

  if (
    state.stage === "free" &&
    v0648Chapter2Unlocked() &&
    state.storyFlags?.marketParentsConfirmed &&
    !state.squareManFirstSpeechDone
  ) {
    if (!state.storyFlags?.squareVisited) {
      $("objective").textContent =
        "Vá à praça central, a leste.";
    } else if (!state.storyFlags?.squareVendorTalked) {
      $("objective").textContent =
        "Pergunte na praça se alguém viu seus pais.";
    } else {
      $("objective").textContent =
        "Fale com o homem de cadeira de rodas no lado leste da praça.";
    }
    return;
  }

  if (
    state.stage === "free" &&
    v0648Chapter3Unlocked() &&
    !state.storyFlags?.raimundoMet
  ) {
    $("objective").textContent =
      "Explore a estrada de terra ao sul.";
    return;
  }

  if (
    state.stage === "free" &&
    state.storyFlags?.raimundoMet &&
    !state.storyFlags?.mineExteriorSeen
  ) {
    $("objective").textContent =
      "Examine os arredores da casa de Raimundo.";
  }
};


// =========================================================
// 0.6.49 — PARTE 2/5
// FIM DO CAP. 3 + CAP. 4 "A RUA SEM LUZ"
// =========================================================

// A Bíblia não fixa onde a lanterna é encontrada. Para evitar criar
// outro mapa ou ressuscitar o baú/câmera removido, a implementação
// mínima usa a gaveta de ferramentas da cozinha.
if (
  maps.kitchen &&
  !maps.kitchen.objects.some(o => o.action === "flashlightPickup")
) {
  maps.kitchen.objects.push(
    {
      x: housePoint(73),
      y: housePoint(250),
      w: housePoint(60),
      h: housePoint(45),
      type: "shelf",
      label: "Examinar a gaveta de ferramentas",
      action: "flashlightPickup"
    }
  );
}

// Rua oeste: propositalmente compacta. O objetivo é investigação,
// iluminação limitada e perseguição, não um corredor enorme e vazio.
if (!maps.westRoad) {
  maps.westRoad = {
    w: 1400,
    h: 760,
    objects: [
      obj(80, 55, 220, 175, "building"),
      obj(365, 70, 220, 165, "building"),
      obj(690, 55, 225, 175, "building"),
      obj(1035, 70, 245, 165, "building"),

      obj(130, 535, 215, 165, "building"),
      obj(455, 545, 205, 155, "building"),
      obj(770, 535, 225, 165, "building"),
      obj(1090, 545, 210, 155, "building")
    ],
    doors: []
  };
}
roomNames.westRoad = "Rua oeste · Forgotten";

const V0649_WEST_BODY = { x: 245, y: 390 };
const V0649_WEST_BLOOD = [
  { id: "blood1", x: 925, y: 418 },
  { id: "blood2", x: 700, y: 396 },
  { id: "blood3", x: 475, y: 425 }
];

let v0649SouthObserverUntil = 0;
let v0649SouthStaticUntil = 0;

function v0649Chapter4Unlocked() {
  return Boolean(
    state &&
    state.stage !== "prologue" &&
    state.day >= 6 &&
    state.storyFlags?.raimundoMet &&
    state.storyFlags?.mineExteriorSeen &&
    state.storyFlags?.observerFirstSeen
  );
}

const v0649PrepareBase = prepareSystems;
prepareSystems = function() {
  v0649PrepareBase();

  if (!state) return;

  let changed = false;

  if (!state.storyFlags || typeof state.storyFlags !== "object") {
    state.storyFlags = {};
    changed = true;
  }

  for (const [key, fallback] of [
    ["observerFirstSeen", false],
    ["southObserverPending", false],
    ["florindaChapter4Concern", false],
    ["florindaChapter4ConcernSeen", false],
    ["chapter4Complete", false]
  ]) {
    if (typeof state.storyFlags[key] !== "boolean") {
      state.storyFlags[key] = fallback;
      changed = true;
    }
  }

  // Saves feitos depois da conversa da praça, mas antes desta versão,
  // não podem disparar a silhueta cedo demais.
  if (state.squareManReturnObserverPending) {
    state.squareManReturnObserverPending = false;
    changed = true;
  }

  if (!state.flashlight || typeof state.flashlight !== "object") {
    state.flashlight = {
      owned: false,
      on: false,
      battery: 100,
      emptyWarned: false
    };
    changed = true;
  }

  if (typeof state.flashlight.owned !== "boolean") {
    state.flashlight.owned = false;
    changed = true;
  }

  if (typeof state.flashlight.on !== "boolean") {
    state.flashlight.on = false;
    changed = true;
  }

  if (!Number.isFinite(state.flashlight.battery)) {
    state.flashlight.battery = 100;
    changed = true;
  }

  state.flashlight.battery = Math.max(
    0,
    Math.min(100, state.flashlight.battery)
  );

  if (typeof state.flashlight.emptyWarned !== "boolean") {
    state.flashlight.emptyWarned = false;
    changed = true;
  }

  if (!state.chapter4 || typeof state.chapter4 !== "object") {
    state.chapter4 = {
      bloodSeen: [],
      bodySeen: false,
      bodyReported: false
    };
    changed = true;
  }

  if (!Array.isArray(state.chapter4.bloodSeen)) {
    state.chapter4.bloodSeen = [];
    changed = true;
  }

  if (typeof state.chapter4.bodySeen !== "boolean") {
    state.chapter4.bodySeen = false;
    changed = true;
  }

  if (typeof state.chapter4.bodyReported !== "boolean") {
    state.chapter4.bodyReported = false;
    changed = true;
  }

  if (!state.garciaEvent || typeof state.garciaEvent !== "object") {
    state.garciaEvent = {
      phase: "waiting",
      x: 330,
      y: 350,
      caught: false
    };
    changed = true;
  }

  if (!["waiting", "chase", "escaped"].includes(state.garciaEvent.phase)) {
    state.garciaEvent.phase =
      state.chapter4.bodySeen ? "escaped" : "waiting";
    changed = true;
  }

  if (!Number.isFinite(state.garciaEvent.x)) {
    state.garciaEvent.x = 330;
    changed = true;
  }

  if (!Number.isFinite(state.garciaEvent.y)) {
    state.garciaEvent.y = 350;
    changed = true;
  }

  if (typeof state.garciaEvent.caught !== "boolean") {
    state.garciaEvent.caught = false;
    changed = true;
  }

  // Compatibilidade: se o corpo já foi marcado como visto por um save
  // de teste, não recria uma perseguição impossível.
  if (
    state.chapter4.bodyReported &&
    state.garciaEvent.phase === "chase"
  ) {
    state.garciaEvent.phase = "escaped";
    state.garciaEvent.caught = false;
    changed = true;
  }

  if (changed) {
    save();
  }
};

function v0649GoWestRoad() {
  prepareSystems();

  if (!v0649Chapter4Unlocked()) {
    v0639EdgeNotice("Ainda não tenho motivo para seguir por aqui.");
    return;
  }

  if (!state.flashlight.owned) {
    v0639EdgeNotice("Sem uma lanterna eu não consigo seguir por essa rua.");
    return;
  }

  // Garcia é o evento grande desta saída. Evita empilhar uma invasão
  // aleatória na volta para casa.
  if (state.randomEventState) {
    state.randomEventState.pending = false;
  }

  state.flashlight.on = true;
  state.flashlight.emptyWarned = false;

  fade(
    "Rua oeste",
    "A iluminação termina algumas quadras adiante.",
    () => {
      state.room = "westRoad";
      state.x = 1335;
      state.y = 390;
      state.facing = "left";
      state.walk = 0;

      keys.clear();
      near = null;
      updateHud();
      save();
    }
  );
}

function v0649ReturnVillageFromWest(escaped = false) {
  prepareSystems();

  if (escaped) {
    state.garciaEvent.phase = "escaped";
    state.garciaEvent.caught = false;
    state.storyFlags.florindaChapter4Concern = true;
  }

  state.flashlight.on = false;

  fade(
    "",
    "",
    () => {
      state.room = "village";
      state.x = 58;
      state.y = 424;
      state.facing = "right";
      state.walk = 0;

      keys.clear();
      near = null;
      updateHud();
      save();

      if (escaped) {
        v06Toast("Consegui voltar para o bairro.", 2.2);
      }
    }
  );
}

function v0649ToggleFlashlight() {
  prepareSystems();

  if (!state.flashlight.owned) {
    v06Toast("Você ainda não tem uma lanterna.", 1.8);
    return;
  }

  if (state.flashlight.battery <= 0) {
    state.flashlight.on = false;
    v06Toast("A lanterna está sem bateria.", 1.8);
    return;
  }

  state.flashlight.on = !state.flashlight.on;
  v06Toast(
    state.flashlight.on
      ? "Lanterna ligada"
      : "Lanterna desligada",
    1.4
  );

  updateHud();
  save();
}

function v0649StartGarciaChase() {
  const e = state.garciaEvent;

  e.phase = "chase";
  e.caught = false;
  e.x = 350;
  e.y = 360;

  keys.clear();

  v06Toast(
    "CORRA · volte para o bairro.",
    2.6
  );

  updateHud();
  save();
}

function v0649GarciaCaught() {
  const e = state.garciaEvent;

  if (e.caught) return;

  e.caught = true;
  keys.clear();

  modal(
    "Garcia te alcançou",
    "Ele te segura antes que você consiga voltar para a rua principal.",
    [
      [
        "Tentar novamente",
        () => {
          closeModal();

          e.phase = "chase";
          e.caught = false;
          e.x = 820;
          e.y = 390;

          state.room = "westRoad";
          state.x = 1110;
          state.y = 390;
          state.facing = "right";
          state.walk = 0;

          state.flashlight.on =
            state.flashlight.battery > 0;

          keys.clear();
          near = null;

          v06Toast(
            "Corra para a saída leste.",
            2.1
          );

          updateHud();
        }
      ]
    ]
  );
}

function v0649PoliceBody() {
  prepareSystems();

  if (state.chapter4.bodyReported) {
    say([
      ["Policial", "O caso da rua oeste já foi registrado."],
      ["Policial", "Não volte para lá sozinho."]
    ]);
    return;
  }

  say(
    [
      ["Você", "Eu encontrei um corpo na rua oeste."],
      ["Policial", "Um corpo? Onde exatamente?"],
      ["Você", "No fim da rua. Tinha sangue pelo caminho."],
      ["Policial", "Você viu mais alguém?"],
      ["Você", "Um homem estava perto dele. Quando me viu, correu atrás de mim."],
      ["Policial", "Pela descrição, pode ser Garcia. Não tire conclusão ainda. Nós vamos verificar."]
    ],
    () => {
      state.chapter4.bodyReported = true;
      updateHud();
      save();
    }
  );
}

// Mantém todos os tópicos anteriores da delegacia e acrescenta
// apenas o relato da rua oeste.
v0630OpenPoliceTopics = function() {
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
      "Falar do Raimundo",
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

  if (state.chapter4?.bodySeen) {
    buttons.push([
      "Falar da rua oeste",
      () => {
        closeModal();
        v0649PoliceBody();
      }
    ]);
  }

  buttons.push(["Sair", closeModal]);

  modal(
    "Delegacia",
    "",
    buttons
  );
};

const v0649GetNearBase = getNear;
getNear = function() {
  prepareSystems();

  if (state?.room === "westRoad") {
    if (state.garciaEvent.phase === "chase") {
      return null;
    }

    for (const mark of V0649_WEST_BLOOD) {
      if (
        !state.chapter4.bloodSeen.includes(mark.id) &&
        Math.hypot(
          state.x - mark.x,
          state.y - mark.y
        ) < 38
      ) {
        return {
          label: "Examinar marca no chão",
          action: "westBlood:" + mark.id
        };
      }
    }

    if (
      !state.chapter4.bodyReported &&
      Math.hypot(
        state.x - V0649_WEST_BODY.x,
        state.y - V0649_WEST_BODY.y
      ) < 42
    ) {
      return {
        label: state.chapter4.bodySeen
          ? "Examinar o corpo novamente"
          : "Examinar o que está no chão",
        action: "westBody"
      };
    }
  }

  return v0649GetNearBase();
};

const v0649InteractBase = interact;
interact = function(action) {
  prepareSystems();

  if (action === "flashlightPickup") {
    if (!v0649Chapter4Unlocked()) {
      say([
        "Uma lanterna velha e algumas pilhas.",
        "Não preciso carregar isso agora."
      ]);
      return;
    }

    if (!state.flashlight.owned) {
      state.flashlight.owned = true;
      state.flashlight.on = false;
      state.flashlight.battery = 100;
      state.flashlight.emptyWarned = false;

      say(
        [
          "Uma lanterna velha da casa.",
          "Ainda funciona. Posso ligar e desligar com L."
        ],
        () => {
          v06Toast("Lanterna adicionada ao inventário.", 2);
          updateHud();
          save();
        }
      );
      return;
    }

    if (state.flashlight.battery < 95) {
      state.flashlight.battery = 100;
      state.flashlight.emptyWarned = false;

      say(
        ["Troquei as pilhas da lanterna pelas que estavam guardadas aqui."],
        () => {
          updateHud();
          save();
        }
      );
      return;
    }

    say([
      "Ainda há algumas pilhas guardadas aqui.",
      "A lanterna está carregada."
    ]);
    return;
  }

  if (action?.startsWith("westBlood:")) {
    const id = action.slice("westBlood:".length);

    if (!state.chapter4.bloodSeen.includes(id)) {
      state.chapter4.bloodSeen.push(id);

      const count = state.chapter4.bloodSeen.length;
      const lines = [
        "Sangue. Não parece seco há muito tempo.",
        "As marcas continuam pela rua.",
        "Alguém arrastou alguma coisa por aqui."
      ];

      say(
        [lines[Math.min(count - 1, lines.length - 1)]],
        () => {
          updateHud();
          save();
        }
      );
    }

    return;
  }

  if (action === "westBody") {
    if (state.chapter4.bodySeen) {
      say([
        "É um homem que eu não conheço.",
        "Não tem nada aqui que ligue isso aos meus pais."
      ]);
      return;
    }

    state.chapter4.bodySeen = true;

    say(
      [
        ["Você", "Tem alguém no chão..."],
        ["Você", "Eu não conheço esse homem."],
        ["Homem", "Ei."],
        ["Você", "..."],
        ["Homem", "Você não devia ter vindo até aqui."],
        ["Você", "O que você fez?"],
        ["Homem", "Vai embora. Agora."]
      ],
      v0649StartGarciaChase
    );

    return;
  }

  if (
    action === "vendor" &&
    state.chapter4?.bodyReported &&
    state.storyFlags?.florindaChapter4Concern &&
    !state.storyFlags.florindaChapter4ConcernSeen
  ) {
    say(
      [
        ["Florinda", "Você foi para a rua oeste, não foi?"],
        ["Você", "Como você sabe?"],
        ["Florinda", "Porque eu conheço essa cidade há tempo demais."],
        ["Florinda", "Escuta: se estiver longe de casa quando começar a clarear, volte."],
        ["Você", "Por quê?"],
        ["Florinda", "Só não fique fora perto das sete. Promete?"]
      ],
      () => {
        state.storyFlags.florindaChapter4ConcernSeen = true;
        state.storyFlags.chapter4Complete = true;
        updateHud();
        save();
      }
    );
    return;
  }

  v0649InteractBase(action);
};

function v0649DrawWestEnvironment(m) {
  rect(0, 0, m.w, m.h, "#252b2e");

  // Rua principal e calçadas.
  rect(0, 295, m.w, 185, "#55585a");
  rect(0, 275, m.w, 20, "#76766f");
  rect(0, 480, m.w, 20, "#76766f");

  for (let x = 20; x < m.w; x += 70) {
    rect(x, 385, 34, 4, "#8c8978");
  }

  // Fachadas residenciais.
  for (const o of m.objects) {
    building(o);
  }

  // Postes: quase todos apagados.
  for (const x of [150, 390, 640, 880, 1130, 1320]) {
    rect(x, 245, 5, 50, "#34383a");
    rect(x - 7, 241, 19, 5, "#4a4d4e");
  }

  // Pequeno beco/corredor visual onde o corpo está.
  rect(170, 300, 155, 92, "#45484a");
  rect(180, 300, 8, 72, "#2d3133");

  // Marcas de sangue. Somente detalhes físicos, sem gore explícito.
  for (const mark of V0649_WEST_BLOOD) {
    rect(mark.x - 8, mark.y - 3, 16, 5, "#4d1f1f");
    rect(mark.x + 5, mark.y + 2, 8, 3, "#3d1919");
  }

  // Corpo desconhecido: silhueta de roupa no chão.
  if (!state.chapter4?.bodyReported) {
    const bx = V0649_WEST_BODY.x;
    const by = V0649_WEST_BODY.y;

    rect(bx - 18, by - 6, 37, 12, "#24292c");
    rect(bx - 31, by - 4, 17, 8, "#1d2225");
    rect(bx + 16, by - 3, 22, 7, "#1d2225");
    rect(bx - 10, by - 13, 14, 10, "#9b735f");

    // Garcia ainda está perto do corpo antes da perseguição.
    if (state.garciaEvent?.phase === "waiting") {
      person(
        330,
        350,
        "npcMale",
        0,
        "left",
        0.94
      );
    }
  } else {
    // Depois do relato, deixa somente uma marca de isolamento simples.
    rect(205, 340, 110, 4, "#b8a76f");
    rect(205, 430, 110, 4, "#b8a76f");
    txt("ÁREA ISOLADA", 218, 380, "#b8a76f", 7);
  }

  if (
    state.garciaEvent?.phase === "chase" &&
    !state.garciaEvent.caught
  ) {
    person(
      state.garciaEvent.x,
      state.garciaEvent.y,
      "npcMale",
      elapsed * 12,
      Math.abs(state.x - state.garciaEvent.x) >
      Math.abs(state.y - state.garciaEvent.y)
        ? (state.x > state.garciaEvent.x ? "right" : "left")
        : (state.y > state.garciaEvent.y ? "down" : "up"),
      0.96
    );
  }

  txt("RUA OESTE", 1165, 265, "#8f8d82", 7);
}

function v0649DrawFlashlightDarkness() {
  if (
    !state ||
    state.room !== "westRoad" ||
    state.dawnCollapse?.active ||
    state.wakeUp?.active
  ) {
    return;
  }

  const on =
    state.flashlight?.owned &&
    state.flashlight.on &&
    state.flashlight.battery > 0;

  let sx = state.x - camera.x;
  let sy = state.y - camera.y - 9;

  if (on) {
    if (state.facing === "left") sx -= 42;
    else if (state.facing === "right") sx += 42;
    else if (state.facing === "up") sy -= 48;
    else sy += 48;
  }

  const inner = on ? 24 : 12;
  const outer = on ? 185 : 68;

  const gradient = c.createRadialGradient(
    sx, sy, inner,
    sx, sy, outer
  );

  if (on) {
    gradient.addColorStop(0, "rgba(0,0,0,0.02)");
    gradient.addColorStop(0.32, "rgba(0,0,0,0.10)");
    gradient.addColorStop(0.68, "rgba(0,0,0,0.58)");
    gradient.addColorStop(1, "rgba(0,0,0,0.95)");
  } else {
    gradient.addColorStop(0, "rgba(0,0,0,0.48)");
    gradient.addColorStop(0.45, "rgba(0,0,0,0.82)");
    gradient.addColorStop(1, "rgba(0,0,0,0.985)");
  }

  c.save();
  c.fillStyle = gradient;
  c.fillRect(0, 0, W, H);

  // Leitura mínima de bateria sem criar uma HUD nova.
  if (state.flashlight?.owned) {
    txt(
      "LANTERNA " +
      Math.ceil(state.flashlight.battery) +
      "% · L",
      14,
      H - 14,
      state.flashlight.battery < 20
        ? "#c49a83"
        : "#c9c2ad",
      7
    );
  }

  c.restore();
}

function v0649DrawSouthObserver() {
  if (
    !state ||
    state.room !== "oldRoad" ||
    elapsed >= v0649SouthObserverUntil ||
    state.dawnCollapse?.active
  ) {
    return;
  }

  c.save();
  c.translate(
    -Math.floor(camera.x),
    -Math.floor(camera.y)
  );

  const x = 355;
  const y = 635;
  const jitter = Math.sin(elapsed * 47) * 2;

  // Forma animal-adjacente, sem olhos/rosto e sem anatomia estável.
  rect(x - 18 + jitter, y - 17, 34, 12, "#040506");
  rect(x - 11 - jitter, y - 28, 23, 16, "#030405");
  rect(x - 24, y - 10 + jitter, 14, 7, "#030405");
  rect(x + 10, y - 12 - jitter, 17, 8, "#030405");
  rect(x - 14, y - 6, 7, 12, "#020304");
  rect(x + 7, y - 7, 8, 13, "#020304");

  c.restore();
}

function v0649DrawSouthStatic() {
  if (
    elapsed >= v0649SouthStaticUntil ||
    state?.dawnCollapse?.active
  ) {
    return;
  }

  const strength = Math.min(
    1,
    Math.max(v0649SouthStaticUntil - elapsed, 0) / 1.15
  );

  for (let i = 0; i < 24; i++) {
    const y =
      (i * 23 + Math.floor(elapsed * 620) % H) % H;

    rect(
      (i % 3) * -5,
      y,
      W + 12,
      1 + (i % 2),
      "rgba(225,230,220," +
      (0.035 + strength * 0.12) +
      ")"
    );
  }
}

const v0649DrawWorldBase = drawWorld;
drawWorld = function() {
  v0649DrawWorldBase();

  v0649DrawSouthObserver();
  v0649DrawSouthStatic();

  if (state?.room === "westRoad") {
    v0649DrawFlashlightDarkness();
  }
};

const v0649UpdateBase = update;
update = function(dt) {
  prepareSystems();
  v0649UpdateBase(dt);

  if (
    !state ||
    mode !== "game" ||
    dialog ||
    transitionBusy ||
    !$("overlay").hidden ||
    state.gameOver ||
    state.dawnCollapse?.active ||
    state.wakeUp?.active
  ) {
    return;
  }

  // Final real do Capítulo 3: depois de examinar a mina, a primeira
  // silhueta aparece à distância quando Estevão começa a voltar.
  if (
    state.room === "oldRoad" &&
    state.storyFlags?.southObserverPending &&
    !state.storyFlags.observerFirstSeen &&
    state.y < 700
  ) {
    state.storyFlags.southObserverPending = false;
    state.storyFlags.observerFirstSeen = true;

    v0649SouthObserverUntil = elapsed + 0.9;
    v0649SouthStaticUntil = elapsed + 1.15;

    keys.clear();
    v06Toast(
      "Alguma coisa estava entre as árvores.",
      2.1
    );

    updateHud();
    save();
    return;
  }

  if (state.room !== "westRoad") return;

  // Bateria é tensão por excursão, não punição permanente.
  // Há pilhas de reposição na própria casa para evitar softlock.
  if (
    state.flashlight.owned &&
    state.flashlight.on &&
    state.flashlight.battery > 0
  ) {
    state.flashlight.battery = Math.max(
      0,
      state.flashlight.battery - dt * 0.18
    );

    if (
      state.flashlight.battery <= 0 &&
      !state.flashlight.emptyWarned
    ) {
      state.flashlight.on = false;
      state.flashlight.emptyWarned = true;
      v06Toast("A lanterna apagou.", 2);
      updateHud();
      save();
    }
  }

  const right =
    keys.has("d") ||
    keys.has("arrowright");

  if (
    state.x >= maps.westRoad.w - 42 &&
    right
  ) {
    state.x = maps.westRoad.w - 44;

    v0649ReturnVillageFromWest(
      state.garciaEvent.phase === "chase"
    );
    return;
  }

  const e = state.garciaEvent;

  if (
    e.phase === "chase" &&
    !e.caught
  ) {
    const dx = state.x - e.x;
    const dy = state.y - e.y;
    const distance = Math.hypot(dx, dy) || 1;

    if (distance < 21) {
      v0649GarciaCaught();
      return;
    }

    const step = Math.min(
      distance,
      108 * dt
    );

    e.x += dx / distance * step;
    e.y += dy / distance * step;
  }
};

const v0649UpdateHudBase = updateHud;
updateHud = function() {
  v0649UpdateHudBase();

  if (!state || state.stage === "prologue") return;

  prepareSystems();

  if (state.flashlight?.owned) {
    const baseInventory = $("inventory").textContent;

    if (!baseInventory.includes("LANTERNA")) {
      $("inventory").textContent =
        baseInventory +
        " · LANTERNA " +
        Math.ceil(state.flashlight.battery) +
        "%";
    }
  }

  if (
    state.garciaEvent?.phase === "chase"
  ) {
    $("objective").textContent =
      "CORRA. Volte para o bairro pela saída leste.";
    return;
  }

  if (
    v0649Chapter4Unlocked() &&
    !state.flashlight.owned
  ) {
    $("objective").textContent =
      "Procure a lanterna na gaveta de ferramentas da cozinha.";
    return;
  }

  if (
    v0649Chapter4Unlocked() &&
    state.flashlight.owned &&
    state.room !== "westRoad" &&
    !state.chapter4.bodySeen
  ) {
    $("objective").textContent =
      "Explore a rua oeste.";
    return;
  }

  if (
    state.room === "westRoad" &&
    !state.chapter4.bodySeen
  ) {
    $("objective").textContent =
      "Explore a rua oeste e siga as marcas de sangue.";
    return;
  }

  if (
    state.chapter4.bodySeen &&
    state.garciaEvent.phase === "escaped" &&
    !state.chapter4.bodyReported
  ) {
    $("objective").textContent =
      "Relate à polícia o que encontrou na rua oeste.";
    return;
  }

  if (
    state.chapter4.bodyReported &&
    state.storyFlags.florindaChapter4Concern &&
    !state.storyFlags.florindaChapter4ConcernSeen
  ) {
    $("objective").textContent =
      "Converse com Florinda.";
    return;
  }

  if (state.storyFlags.chapter4Complete) {
    $("objective").textContent =
      "A rua oeste foi registrada. Continue observando Forgotten.";
  }
};

// L liga/desliga a lanterna. Não interfere com diálogo, pausa ou transição.
window.addEventListener(
  "keydown",
  event => {
    if (
      event.key.toLowerCase() !== "l" ||
      event.repeat ||
      mode !== "game" ||
      !state ||
      dialog ||
      transitionBusy ||
      !$("overlay").hidden
    ) {
      return;
    }

    event.preventDefault();
    v0649ToggleFlashlight();
  },
  true
);

// Comando de desenvolvimento para testar o Capítulo 4 sem quebrar saves.
const v0649DevCommandBase = v0645RunDevCommand;
v0645RunDevCommand = function(raw) {
  const command = String(raw || "").trim().toLowerCase();

  if (command === "oeste") {
    prepareSystems();

    state.stage = "free";
    state.day = Math.max(6, state.day || 6);
    state.finished = true;

    state.storyFlags.marketParentsConfirmed = true;
    state.squareManFirstSpeechDone = true;
    state.storyFlags.raimundoMet = true;
    state.storyFlags.mineExteriorSeen = true;
    state.storyFlags.observerFirstSeen = true;
    state.storyFlags.southObserverPending = false;

    state.flashlight.owned = true;
    state.flashlight.on = true;
    state.flashlight.battery = 100;
    state.flashlight.emptyWarned = false;

    state.chapter4.bloodSeen = [];
    state.chapter4.bodySeen = false;
    state.chapter4.bodyReported = false;

    state.garciaEvent.phase = "waiting";
    state.garciaEvent.x = 330;
    state.garciaEvent.y = 350;
    state.garciaEvent.caught = false;

    state.room = "westRoad";
    state.x = 1335;
    state.y = 390;
    state.facing = "left";
    state.walk = 0;

    v0645ResetTransientState();
    state.flashlight.on = true;

    updateHud();
    save();

    v06Toast("TESTE: Capítulo 4 · rua oeste", 2);
    return;
  }

  v0649DevCommandBase(raw);
};

const v0649OpenDevPanelBase = v0645OpenDevPanel;
v0645OpenDevPanel = function() {
  v0649OpenDevPanelBase();

  const pre = $("modalText").querySelector("pre");

  if (
    pre &&
    !pre.textContent.includes("oeste")
  ) {
    pre.textContent +=
      "\noeste       → testa a Rua Sem Luz / Capítulo 4";
  }
};

// Ajuda final da 0.6.49.
$("help").onclick = () => modal(
  "Como jogar",
  "WASD / setas: andar. Shift/F: correr quando disponível. E: interagir. I: inventário. L: ligar/desligar a lanterna. Esc: pausar. ESPAÇO: soco apenas contra ameaças físicas compatíveis.\n\nA fome do irmão cai durante o jogo ativo. Eventos importantes não são empilhados durante a sequência da rua oeste.\n\nÀs 07:00, depois da primeira meia-noite, Estevão perde os sentidos.",
  [["Voltar", closeModal]]
);


// =========================================================
// 0.6.50 — PARTES 3/5 E 4/5
// CAPÍTULO 5 "PADRÕES" — CONTRADIÇÕES E DIÁRIO
// =========================================================

const V0650_CONTRADICTION_LABELS = {
  policeRecord: "Registro policial que Anísio não lembra de ter escrito",
  marketTime: "Horário lembrado pelo funcionário não bate com o recibo",
  squareFountain: "Memória do morador não bate com a placa da praça"
};

function v0650EnsureInvestigationLog() {
  if (!state) return null;

  if (
    !state.investigationLog ||
    typeof state.investigationLog !== "object"
  ) {
    state.investigationLog = {};
  }

  if (!Array.isArray(state.investigationLog.contradictions)) {
    state.investigationLog.contradictions = [];
  }

  if (
    !state.investigationLog.keyClues ||
    typeof state.investigationLog.keyClues !== "object"
  ) {
    state.investigationLog.keyClues = {};
  }

  for (const id of [
    "marketConfirmed",
    "policeContradiction",
    "fatherNotebook",
    "photoCopy",
    "florindaConfession",
    "splitReveal"
  ]) {
    if (typeof state.investigationLog.keyClues[id] !== "boolean") {
      state.investigationLog.keyClues[id] = false;
    }
  }

  if (state.storyFlags?.marketParentsConfirmed) {
    state.investigationLog.keyClues.marketConfirmed = true;
  }

  if (
    !state.memoryFacts ||
    typeof state.memoryFacts !== "object"
  ) {
    state.memoryFacts = {
      squarePlaqueRead: false,
      squareResidentHeard: false,
      marketTimeChecked: false,
      policeRecordChecked: false
    };
  }

  for (const key of [
    "squarePlaqueRead",
    "squareResidentHeard",
    "marketTimeChecked",
    "policeRecordChecked"
  ]) {
    if (typeof state.memoryFacts[key] !== "boolean") {
      state.memoryFacts[key] = false;
    }
  }

  return state.investigationLog;
}

function v0650HasContradiction(id) {
  const log = v0650EnsureInvestigationLog();
  return Boolean(log?.contradictions.includes(id));
}

function v0650RecordContradiction(id) {
  const log = v0650EnsureInvestigationLog();

  if (!log || log.contradictions.includes(id)) {
    return false;
  }

  log.contradictions.push(id);

  if (id === "policeRecord") {
    log.keyClues.policeContradiction = true;
  }

  v06Toast(
    "Contradição registrada · " +
    log.contradictions.length +
    "/3",
    2.4
  );

  updateHud();
  save();
  return true;
}

function v0650Chapter5Unlocked() {
  return Boolean(
    state &&
    state.stage !== "prologue" &&
    state.day >= 8 &&
    state.storyFlags?.chapter4Complete
  );
}

function v0650Chapter5Ready() {
  return Boolean(
    v0650Chapter5Unlocked() &&
    v0650EnsureInvestigationLog().contradictions.length >= 3
  );
}

function v0650OpenJournal() {
  prepareSystems();
  const log = v0650EnsureInvestigationLog();

  modal(
    "Diário de investigação",
    "",
    [["Fechar", closeModal]]
  );

  const root = $("modalText");
  root.replaceChildren();

  const clueTitle = document.createElement("strong");
  clueTitle.textContent = "PISTAS IMPORTANTES";
  root.append(clueTitle);

  const q = chapter();
  const clueBox = document.createElement("div");
  clueBox.style.display = "grid";
  clueBox.style.gap = "6px";
  clueBox.style.margin = "10px 0 18px";

  const collected = q?.clues || [];

  if (!collected.length) {
    const none = document.createElement("div");
    none.textContent = "Nenhuma pista registrada.";
    clueBox.append(none);
  } else {
    for (const id of collected) {
      if (!["list", "photo", "note"].includes(id)) continue;

      const row = document.createElement("div");
      row.textContent =
        "• " +
        v0645ClueName(id) +
        " — " +
        clueText[id];
      clueBox.append(row);
    }
  }

  root.append(clueBox);

  const contradictionTitle = document.createElement("strong");
  contradictionTitle.textContent = "CONTRADIÇÕES OBSERVADAS";
  root.append(contradictionTitle);

  const contradictionBox = document.createElement("div");
  contradictionBox.style.display = "grid";
  contradictionBox.style.gap = "7px";
  contradictionBox.style.marginTop = "10px";

  if (!log.contradictions.length) {
    const none = document.createElement("div");
    none.textContent =
      "Nenhuma contradição de memória confirmada.";
    contradictionBox.append(none);
  } else {
    for (const id of log.contradictions) {
      const row = document.createElement("div");
      row.textContent =
        "• " +
        (V0650_CONTRADICTION_LABELS[id] || id);
      contradictionBox.append(row);
    }
  }

  root.append(contradictionBox);

  if (v0650Chapter5Unlocked()) {
    const hint = document.createElement("p");
    hint.style.marginTop = "16px";
    hint.textContent =
      log.contradictions.length >= 3
        ? "Há um padrão. Três contradições já não parecem coincidência."
        : "Compare o que as pessoas dizem com registros físicos e com o que você já viu.";
    root.append(hint);
  }
}

// J volta a ser o diário de investigação. I continua sendo inventário.
openJournal = function() {
  v0650OpenJournal();
};

const v0650Chapter5PrepareBase = prepareSystems;
prepareSystems = function() {
  v0650Chapter5PrepareBase();

  if (!state) return;

  v0650EnsureInvestigationLog();

  if (!state.chapter5 || typeof state.chapter5 !== "object") {
    state.chapter5 = {
      complete: false,
      brotherLineSeen: false
    };
  }

  if (typeof state.chapter5.complete !== "boolean") {
    state.chapter5.complete = false;
  }

  if (typeof state.chapter5.brotherLineSeen !== "boolean") {
    state.chapter5.brotherLineSeen = false;
  }
};

const V0650_SQUARE_RESIDENT = {
  x: 575,
  y: 360
};

const V0650_SQUARE_PLAQUE = {
  x: 487,
  y: 410
};

const v0650Chapter5GetNearBase = getNear;
getNear = function() {
  prepareSystems();

  if (
    state?.room === "square" &&
    v0650Chapter5Unlocked()
  ) {
    if (
      Math.hypot(
        state.x - V0650_SQUARE_PLAQUE.x,
        state.y - V0650_SQUARE_PLAQUE.y
      ) < 38
    ) {
      return {
        label: "Ler a placa da fonte",
        action: "memory:squarePlaque"
      };
    }

    if (
      Math.hypot(
        state.x - V0650_SQUARE_RESIDENT.x,
        state.y - V0650_SQUARE_RESIDENT.y
      ) < 42
    ) {
      return {
        label: "Falar com o morador",
        action: "memory:squareResident"
      };
    }
  }

  return v0650Chapter5GetNearBase();
};

function v0650TrySquareContradiction() {
  if (
    state.memoryFacts.squarePlaqueRead &&
    state.memoryFacts.squareResidentHeard
  ) {
    v0650RecordContradiction("squareFountain");
  }
}

function v0650PoliceContradiction() {
  prepareSystems();

  if (v0650HasContradiction("policeRecord")) {
    say([
      ["Anísio", "Eu já conferi aquilo três vezes."],
      ["Anísio", "A assinatura é minha. O texto parece meu. Mas eu não lembro de escrever."]
    ]);
    return;
  }

  say(
    [
      ["Você", "Esse relatório é do caso dos meus pais?"],
      ["Anísio", "É... espera."],
      ["Você", "O que foi?"],
      ["Anísio", "Está assinado por mim e datado de ontem."],
      ["Você", "Então?"],
      ["Anísio", "Eu não escrevi isso."],
      ["Você", "A assinatura é sua."],
      ["Anísio", "Eu sei como é a minha assinatura."],
      ["Anísio", "E é exatamente por isso que isso está me incomodando."]
    ],
    () => {
      state.memoryFacts.policeRecordChecked = true;
      v0650RecordContradiction("policeRecord");
    }
  );
}

function v0650OpenPoliceTopics() {
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
      "Falar do Raimundo",
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

  if (state.chapter4?.bodySeen) {
    buttons.push([
      "Falar da rua oeste",
      () => {
        closeModal();
        v0649PoliceBody();
      }
    ]);
  }

  if (v0650Chapter5Unlocked()) {
    buttons.push([
      v0650HasContradiction("policeRecord")
        ? "Rever o relatório estranho"
        : "Conferir um relatório",
      () => {
        closeModal();
        v0650PoliceContradiction();
      }
    ]);
  }

  buttons.push(["Sair", closeModal]);

  modal(
    "Delegacia",
    "",
    buttons
  );
}

v0630OpenPoliceTopics = v0650OpenPoliceTopics;

const v0650Chapter5InteractBase = interact;
interact = function(action) {
  prepareSystems();

  if (action === "memory:squarePlaque") {
    const first = !state.memoryFacts.squarePlaqueRead;
    state.memoryFacts.squarePlaqueRead = true;

    say(
      [
        "Uma placa de metal presa à base da fonte:",
        "“Fonte da praça · inaugurada em 1987.”"
      ],
      () => {
        if (first) {
          v0650TrySquareContradiction();
          save();
        }
      }
    );
    return;
  }

  if (action === "memory:squareResident") {
    const first = !state.memoryFacts.squareResidentHeard;
    state.memoryFacts.squareResidentHeard = true;

    say(
      [
        ["Morador", "Essa fonte não existia antes de dois anos atrás."],
        ["Você", "Tem certeza?"],
        ["Morador", "Tenho. Eu estava aqui no dia em que instalaram."]
      ],
      () => {
        if (first) {
          v0650TrySquareContradiction();
          save();
        }
      }
    );
    return;
  }

  if (
    action === "marketClerk" &&
    v0650Chapter5Unlocked() &&
    !state.memoryFacts.marketTimeChecked
  ) {
    say(
      [
        ["Você", "Você lembra que horas meus pais chegaram aqui?"],
        ["Funcionário", "Quase quatro da tarde. Tenho certeza."],
        ["Você", "Dá para conferir o recibo?"],
        ["Funcionário", "Espera... ele ainda está no sistema."],
        ["Funcionário", "14:20."],
        ["Você", "Então por que você lembra de quase quatro?"],
        ["Funcionário", "...Eu lembro de olhar para o relógio."],
        ["Funcionário", "Mas o recibo não mudou."]
      ],
      () => {
        state.memoryFacts.marketTimeChecked = true;
        v0650RecordContradiction("marketTime");
      }
    );
    return;
  }

  if (
    action === "brother" &&
    v0650Chapter5Ready() &&
    !state.chapter5.brotherLineSeen
  ) {
    say(
      [
        ["Irmão", "Você está escrevendo tudo agora."],
        ["Você", "Porque as pessoas estão falando coisas diferentes."],
        ["Irmão", "Você também."],
        ["Você", "Como assim?"],
        ["Irmão", "Você lembra diferente de ontem."],
        ["Você", "...Diferente como?"],
        ["Irmão", "Ontem você disse que o homem do mercado lembrava certinho. Hoje você disse que nunca confiou nele."]
      ],
      () => {
        state.chapter5.brotherLineSeen = true;
        state.chapter5.complete = true;
        v06Toast("Capítulo 5 concluído · Padrões", 2.5);
        updateHud();
        save();
      }
    );
    return;
  }

  v0650Chapter5InteractBase(action);
};

const v0650Chapter5DrawBase = drawWorld;
drawWorld = function() {
  v0650Chapter5DrawBase();

  if (
    !state ||
    state.room !== "square" ||
    !v0650Chapter5Unlocked()
  ) {
    return;
  }

  c.save();
  c.translate(
    -Math.floor(camera.x),
    -Math.floor(camera.y)
  );

  person(
    V0650_SQUARE_RESIDENT.x,
    V0650_SQUARE_RESIDENT.y,
    "npcMale",
    0,
    "left",
    0.9
  );

  rect(
    V0650_SQUARE_PLAQUE.x - 12,
    V0650_SQUARE_PLAQUE.y - 6,
    24,
    12,
    "#77705f"
  );

  c.restore();
};

const v0650Chapter5HudBase = updateHud;
updateHud = function() {
  v0650Chapter5HudBase();

  if (
    !state ||
    state.stage === "prologue" ||
    !v0650Chapter5Unlocked()
  ) {
    return;
  }

  prepareSystems();

  if (!state.chapter5.complete) {
    const count =
      state.investigationLog.contradictions.length;

    if (count < 3) {
      $("objective").textContent =
        "Compare relatos e registros em Forgotten: " +
        count +
        "/3 contradições. C: celular.";
    } else {
      $("objective").textContent =
        "Converse com seu irmão sobre o que você registrou.";
    }
  }
};


// =========================================================
// 0.6.50 — CAPÍTULO 6 "O PORÃO"
// =========================================================

if (!maps.basement) {
  room(
    "basement",
    [
      obj(
        82, 78, 118, 58,
        "crate",
        "Abrir a caixa de ferramentas",
        "basementNotebook"
      ),
      obj(
        245, 225, 138, 58,
        "table",
        "Examinar o mapa rabiscado",
        "basementMap"
      ),
      obj(
        455, 72, 105, 190,
        "shelf",
        "Examinar o armário antigo",
        "basementCabinet"
      ),
      obj(80, 260, 95, 55, "crate"),
      obj(210, 82, 72, 48, "crate"),
      obj(318, 85, 82, 46, "shelf")
    ],
    [
      door(
        310, 374,
        "village", 388, 548,
        "Voltar ao quintal"
      )
    ]
  );
}
roomNames.basement = "Porão dos Lancaster";

function v0650Chapter6Unlocked() {
  return Boolean(
    state &&
    state.day >= 11 &&
    state.chapter5?.complete &&
    v0650EnsureInvestigationLog().contradictions.length >= 3
  );
}

const v0650Chapter6PrepareBase = prepareSystems;
prepareSystems = function() {
  v0650Chapter6PrepareBase();

  if (!state) return;

  if (!state.chapter6 || typeof state.chapter6 !== "object") {
    state.chapter6 = {
      basementUnlocked: false,
      notebookRead: false,
      mapRead: false,
      cabinetInspected: false,
      staticSeen: false,
      complete: false
    };
  }

  for (const key of [
    "basementUnlocked",
    "notebookRead",
    "mapRead",
    "cabinetInspected",
    "staticSeen",
    "complete"
  ]) {
    if (typeof state.chapter6[key] !== "boolean") {
      state.chapter6[key] = false;
    }
  }
};

function v0650OpenBasement() {
  prepareSystems();

  if (!v0650Chapter6Unlocked()) {
    const count =
      state.investigationLog?.contradictions?.length || 0;

    if (state.day < 11) {
      say([
        "A entrada continua trancada.",
        "Ainda não tenho motivo suficiente para forçar isso."
      ]);
    } else if (count < 3) {
      say([
        "A entrada continua trancada.",
        "As contradições que encontrei ainda não formam um padrão claro."
      ]);
    } else {
      say([
        "Ainda falta alguma coisa antes de mexer no porão."
      ]);
    }

    return;
  }

  state.chapter6.basementUnlocked = true;

  fade(
    "O porão",
    "A fechadura antiga cede depois de alguns minutos.",
    () => {
      go("basement", 310, 330);
      save();
    }
  );
}

function v0650ReadFatherNotebook() {
  prepareSystems();

  if (state.chapter6.notebookRead) {
    say([
      "O caderno está cheio de datas, nomes e versões diferentes da mesma história.",
      "A última anotação sublinhada diz: “estrada sul · poço da mina”."
    ]);
    return;
  }

  say(
    [
      "Dentro da caixa de ferramentas há um caderno do meu pai.",
      "As primeiras páginas parecem anotações comuns. Depois começam as comparações.",
      "“Dona Marta disse terça. Hoje jurou que foi quinta.”",
      "“Anísio mostrou um registro e depois disse que nunca viu aquilo.”",
      "“Se duas lembranças não batem, confiar primeiro no que ficou escrito antes.”",
      "As páginas finais ficam mais apressadas.",
      "“Estrada sul. Poço antigo. Fui até lá uma vez. Não devia ter ido sozinho.”"
    ],
    () => {
      state.chapter6.notebookRead = true;
      v0650EnsureInvestigationLog().keyClues.fatherNotebook = true;
      v06Toast("Caderno do pai salvo nas notas do celular.", 2.2);
      v0650TryCompleteChapter6();
      updateHud();
      save();
    }
  );
}

function v0650ReadBasementMap() {
  prepareSystems();

  if (state.chapter6.mapRead) {
    say([
      "O desenho liga o bairro à estrada do sul e termina num círculo marcado perto do antigo poço."
    ]);
    return;
  }

  say(
    [
      "Um mapa desenhado à mão.",
      "A estrada do sul está marcada várias vezes.",
      "Perto da mina, meu pai circulou o poço e escreveu apenas: “voltar com alguém”."
    ],
    () => {
      state.chapter6.mapRead = true;
      v0650TryCompleteChapter6();
      updateHud();
      save();
    }
  );
}

function v0650TryCompleteChapter6() {
  if (
    state.chapter6.notebookRead &&
    state.chapter6.mapRead &&
    state.chapter6.cabinetInspected &&
    !state.chapter6.complete
  ) {
    state.chapter6.complete = true;
    v06Toast("Capítulo 6 concluído · O Porão", 2.5);
  }
}

function v0650InspectBasementCabinet() {
  prepareSystems();

  if (!state.chapter6.cabinetInspected) {
    state.chapter6.cabinetInspected = true;

    say(
      [
        "Um armário antigo ocupa quase toda a parede.",
        "Há riscos compridos no chão, como se esse móvel já tivesse sido arrastado antes.",
        "É pesado demais para mexer sem saber o que estou procurando."
      ],
      () => {
        v0650TryCompleteChapter6();
        updateHud();
        save();
      }
    );

    return;
  }

  say([
    "Os riscos continuam até a parede atrás do armário.",
    "Tem alguma coisa estranha nessa parte do porão."
  ]);
}

const v0650Chapter6InteractBase = interact;
interact = function(action) {
  prepareSystems();

  if (action === "yardBasement") {
    v0650OpenBasement();
    return;
  }

  if (action === "basementNotebook") {
    v0650ReadFatherNotebook();
    return;
  }

  if (action === "basementMap") {
    v0650ReadBasementMap();
    return;
  }

  if (action === "basementCabinet") {
    v0650InspectBasementCabinet();
    return;
  }

  v0650Chapter6InteractBase(action);
};

let v0650BasementStaticUntil = 0;

const v0650Chapter6UpdateBase = update;
update = function(dt) {
  prepareSystems();
  v0650Chapter6UpdateBase(dt);

  if (
    !state ||
    mode !== "game" ||
    dialog ||
    transitionBusy ||
    !$("overlay").hidden ||
    state.gameOver ||
    state.dawnCollapse?.active ||
    state.wakeUp?.active
  ) {
    return;
  }

  if (
    state.room === "basement" &&
    state.chapter6.notebookRead &&
    !state.chapter6.staticSeen &&
    state.x > housePoint(405)
  ) {
    state.chapter6.staticSeen = true;
    v0650BasementStaticUntil = elapsed + 0.75;
    keys.clear();

    v06Toast(
      "A lâmpada chiou por um instante.",
      1.8
    );
    save();
  }
};

const v0650Chapter6DrawBase = drawWorld;
drawWorld = function() {
  v0650Chapter6DrawBase();

  if (
    !state ||
    state.room !== "basement" ||
    elapsed >= v0650BasementStaticUntil
  ) {
    return;
  }

  // Esta estática não é decoração: acontece uma única vez quando
  // Estevão se aproxima da parede ligada à passagem.
  for (let i = 0; i < 18; i++) {
    const y =
      (i * 19 + Math.floor(elapsed * 700) % H) % H;

    rect(
      0,
      y,
      W,
      1 + (i % 2),
      "rgba(224,229,220,0.10)"
    );
  }
};

const v0650Chapter6HudBase = updateHud;
updateHud = function() {
  v0650Chapter6HudBase();

  if (
    !state ||
    state.stage === "prologue" ||
    !state.chapter5?.complete
  ) {
    return;
  }

  prepareSystems();

  if (
    state.chapter5.complete &&
    state.day < 11 &&
    !state.chapter6.complete
  ) {
    $("objective").textContent =
      "As contradições formam um padrão. Continue registrando o que é físico e o que é lembrança.";
    return;
  }

  if (
    state.day >= 11 &&
    !state.chapter6.basementUnlocked
  ) {
    $("objective").textContent =
      "Volte à entrada externa do porão no quintal.";
    return;
  }

  if (
    state.room === "basement" &&
    !state.chapter6.notebookRead
  ) {
    $("objective").textContent =
      "Procure o que seu pai escondia no porão.";
    return;
  }

  if (
    state.room === "basement" &&
    state.chapter6.notebookRead &&
    !state.chapter6.mapRead
  ) {
    $("objective").textContent =
      "Examine as outras anotações do porão.";
    return;
  }

  if (
    state.room === "basement" &&
    state.chapter6.notebookRead &&
    state.chapter6.mapRead &&
    !state.chapter6.cabinetInspected
  ) {
    $("objective").textContent =
      "Examine o armário antigo contra a parede.";
    return;
  }

  if (
    state.chapter6.complete &&
    state.day < 14
  ) {
    $("objective").textContent =
      "O caderno termina na estrada do sul e no poço da mina.";
  }
};


// =========================================================
// 0.6.50 — CAPÍTULO 7 "RETORNO"
// CÓPIA DO PAI + FOTOGRAFIA + PERSEGUIÇÃO DOMÉSTICA
// =========================================================

const V0650_FATHER_HOME_POS = {
  x: housePoint(440),
  y: housePoint(245)
};

const V0650_ATTIC_HIDE_POS = {
  x: housePoint(515),
  y: housePoint(275)
};

let v0650CopyStaticUntil = 0;

function v0650Chapter7Unlocked() {
  return Boolean(
    state &&
    state.day >= 14 &&
    state.chapter6?.complete
  );
}

const v0650Chapter7PrepareBase = prepareSystems;
prepareSystems = function() {
  v0650Chapter7PrepareBase();

  if (!state) return;

  if (!state.copyFather || typeof state.copyFather !== "object") {
    state.copyFather = {
      phase: "waiting",
      room: "foyer",
      x: V0650_FATHER_HOME_POS.x,
      y: V0650_FATHER_HOME_POS.y,
      followDelay: 0,
      caught: false
    };
  }

  if (![
    "waiting",
    "pending",
    "inside",
    "suspect",
    "chase",
    "resolved"
  ].includes(state.copyFather.phase)) {
    state.copyFather.phase = "waiting";
  }

  if (!Number.isFinite(state.copyFather.x)) {
    state.copyFather.x = V0650_FATHER_HOME_POS.x;
  }

  if (!Number.isFinite(state.copyFather.y)) {
    state.copyFather.y = V0650_FATHER_HOME_POS.y;
  }

  if (!Number.isFinite(state.copyFather.followDelay)) {
    state.copyFather.followDelay = 0;
  }

  if (typeof state.copyFather.caught !== "boolean") {
    state.copyFather.caught = false;
  }

  if (!state.chapter7 || typeof state.chapter7 !== "object") {
    state.chapter7 = {
      started: false,
      brotherWarned: false,
      photoCompared: false,
      brotherFollowing: false,
      hideUnlocked: false,
      complete: false
    };
  }

  for (const key of [
    "started",
    "brotherWarned",
    "photoCompared",
    "brotherFollowing",
    "hideUnlocked",
    "complete"
  ]) {
    if (typeof state.chapter7[key] !== "boolean") {
      state.chapter7[key] = false;
    }
  }

  if (
    v0650Chapter7Unlocked() &&
    !state.chapter7.started &&
    state.copyFather.phase === "waiting"
  ) {
    state.copyFather.phase = "pending";
  }

  // Se a perseguição atravessar o amanhecer, a cópia perde sustentação.
  // Isso impede um save de acordar no dia seguinte com a IA ainda ativa.
  if (
    state.copyFather.phase === "chase" &&
    state.minutes >= 420 &&
    !state.chapter7.complete
  ) {
    state.copyFather.phase = "resolved";
    state.copyFather.room = "";
    state.copyFather.caught = false;
    state.chapter7.brotherFollowing = false;
    state.chapter7.complete = true;
    state.storyFlags.fatherCopyExposed = true;
  }
};

function v0650StartFatherReturn() {
  prepareSystems();

  if (
    state.copyFather.phase !== "pending" ||
    !v0650Chapter7Unlocked()
  ) {
    return false;
  }

  state.chapter7.started = true;

  say(
    [
      "TOC. TOC.",
      ["Você", "Quem é?"],
      ["Pai", "Estevão? Abre a porta."],
      ["Você", "...Pai?"],
      "Quando a porta abre, ele está sozinho.",
      ["Você", "Cadê a mãe?"],
      ["Pai", "Depois eu explico. Primeiro deixa eu entrar."]
    ],
    () => {
      state.copyFather.phase = "inside";
      state.copyFather.room = "foyer";
      state.copyFather.x = V0650_FATHER_HOME_POS.x;
      state.copyFather.y = V0650_FATHER_HOME_POS.y;
      state.copyFather.caught = false;

      v06Toast("Seu pai voltou sozinho.", 2.3);
      updateHud();
      save();
    }
  );

  return true;
}

function v0650BrotherWarnsAboutFather() {
  prepareSystems();

  say(
    [
      ["Irmão", "Ele voltou."],
      ["Você", "Eu vi. Graças a Deus."],
      ["Irmão", "Não."],
      ["Você", "O quê?"],
      ["Irmão", "Ele não perguntou onde eu estava. Ele sempre pergunta primeiro."],
      ["Você", "Ele pode estar assustado."],
      ["Irmão", "Compara com a foto. O bilhete disse pra fazer isso, lembra?"]
    ],
    () => {
      state.chapter7.brotherWarned = true;
      state.copyFather.phase = "suspect";
      updateHud();
      save();
    }
  );
}

function v0650CompareFatherPhoto() {
  prepareSystems();

  if (state.copyFather.phase !== "suspect") {
    return;
  }

  const hasPhoto =
    chapter()?.clues?.includes("photo");

  if (!hasPhoto) {
    say([
      "Preciso encontrar a fotografia antes de confrontá-lo."
    ]);
    return;
  }

  say(
    [
      ["Você", "Pai... lembra dessa foto?"],
      ["Pai", "Claro. Seu aniversário."],
      ["Você", "Onde foi?"],
      ["Pai", "Na praça."],
      ["Você", "Não foi na praça. Foi perto da escada."],
      ["Pai", "..."],
      ["Você", "Você só olhou para a foto depois que eu corrigi."],
      ["Pai", "Estevão. Guarda isso."],
      ["Você", "Quem é você?"],
      ["Pai", "..."],
      ["Pai", "Você não devia ter comparado."]
    ],
    () => {
      state.chapter7.photoCompared = true;
      v0650EnsureInvestigationLog().keyClues.photoCopy = true;
      v0650CopyStaticUntil = elapsed + 1.1;
      v0650StartFatherChase();
    }
  );
}

function v0650StartFatherChase() {
  const e = state.copyFather;

  e.phase = "chase";
  e.room = state.room;
  e.x = Math.max(
    housePoint(80),
    Math.min(
      maps[state.room].w - housePoint(80),
      state.x + housePoint(120)
    )
  );
  e.y = state.y;
  e.followDelay = 0;
  e.caught = false;

  state.chapter7.brotherFollowing = false;
  state.chapter7.hideUnlocked = true;

  keys.clear();

  v06Toast(
    "CORRA · encontre seu irmão.",
    2.5
  );

  updateHud();
  save();
}

function v0650FatherCaught() {
  const e = state.copyFather;

  if (e.caught) return;

  e.caught = true;
  keys.clear();

  modal(
    "Ele te alcançou",
    "A mão dele fecha no seu braço antes que você consiga chegar ao seu irmão.",
    [
      [
        "Tentar novamente",
        () => {
          closeModal();

          state.room = "foyer";
          state.x = housePoint(190);
          state.y = housePoint(285);
          state.facing = "right";
          state.walk = 0;

          state.chapter7.brotherFollowing = false;

          e.phase = "chase";
          e.room = "foyer";
          e.x = V0650_FATHER_HOME_POS.x;
          e.y = V0650_FATHER_HOME_POS.y;
          e.followDelay = 0;
          e.caught = false;

          keys.clear();
          near = null;

          v06Toast(
            "Encontre seu irmão e leve-o ao sótão.",
            2.2
          );

          updateHud();
          save();
        }
      ]
    ]
  );
}

function v0650TakeBrotherDuringChase() {
  say(
    [
      ["Você", "Vem comigo. Agora."],
      ["Irmão", "É ele?"],
      ["Você", "Não olha pra trás. Só fica comigo."]
    ],
    () => {
      state.chapter7.brotherFollowing = true;
      v06Toast("Leve seu irmão ao sótão.", 2);
      updateHud();
      save();
    }
  );
}

function v0650HideFromFather() {
  if (
    state.copyFather.phase !== "chase" ||
    !state.chapter7.brotherFollowing
  ) {
    return;
  }

  keys.clear();

  say(
    [
      "Vocês se apertam atrás dos móveis cobertos por lençóis.",
      "Passos sobem a escada.",
      "O irmão prende a respiração.",
      "A estática toma o cômodo por alguns segundos.",
      "Os passos param do outro lado da porta.",
      "...",
      "Depois descem novamente.",
      "Quando o ruído desaparece, a casa fica em silêncio.",
      "Espero mais alguns minutos e levo meu irmão de volta ao quarto."
    ],
    () => {
      state.copyFather.phase = "resolved";
      state.copyFather.room = "";
      state.copyFather.caught = false;
      state.chapter7.brotherFollowing = false;
      state.chapter7.complete = true;
      state.storyFlags.fatherCopyExposed = true;

      v0650CopyStaticUntil = elapsed + 1.3;

      v06Toast(
        "Capítulo 7 concluído · Retorno",
        2.5
      );

      updateHud();
      save();
    }
  );
}

const v0650Chapter7GetNearBase = getNear;
getNear = function() {
  prepareSystems();

  if (
    ["inside", "suspect"].includes(state.copyFather?.phase) &&
    state.room === "foyer" &&
    Math.hypot(
      state.x - state.copyFather.x,
      state.y - state.copyFather.y
    ) < 48
  ) {
    return {
      label:
        state.copyFather.phase === "suspect"
          ? "Comparar com a fotografia"
          : "Falar com seu pai",
      action:
        state.copyFather.phase === "suspect"
          ? "compareFatherPhoto"
          : "copyFatherTalk"
    };
  }

  if (
    state.copyFather?.phase === "chase" &&
    state.chapter7.brotherFollowing &&
    state.room === "attic" &&
    Math.hypot(
      state.x - V0650_ATTIC_HIDE_POS.x,
      state.y - V0650_ATTIC_HIDE_POS.y
    ) < 48
  ) {
    return {
      label: "Esconder-se com seu irmão",
      action: "fatherHide"
    };
  }

  return v0650Chapter7GetNearBase();
};

const v0650Chapter7InteractBase = interact;
interact = function(action) {
  prepareSystems();

  if (
    action === "outside" &&
    state.room === "foyer" &&
    state.copyFather?.phase === "pending"
  ) {
    v0650StartFatherReturn();
    return;
  }

  if (
    action === "outside" &&
    state.room === "foyer" &&
    ["inside", "suspect", "chase"].includes(
      state.copyFather?.phase
    )
  ) {
    say([
      state.copyFather.phase === "chase"
        ? "Não posso fugir e deixar meu irmão aqui."
        : "Meu pai acabou de voltar. Preciso entender o que está acontecendo."
    ]);
    return;
  }

  if (
    action === "copyFatherTalk" &&
    state.copyFather?.phase === "inside"
  ) {
    say([
      ["Pai", "Eu estou cansado. Vai ver seu irmão."],
      ["Pai", "Depois eu explico o que aconteceu."]
    ]);
    return;
  }

  if (
    action === "brother" &&
    state.copyFather?.phase === "inside" &&
    !state.chapter7.brotherWarned
  ) {
    v0650BrotherWarnsAboutFather();
    return;
  }

  if (action === "compareFatherPhoto") {
    v0650CompareFatherPhoto();
    return;
  }

  if (
    action === "brother" &&
    state.copyFather?.phase === "chase" &&
    !state.chapter7.brotherFollowing
  ) {
    v0650TakeBrotherDuringChase();
    return;
  }

  if (action === "fatherHide") {
    v0650HideFromFather();
    return;
  }

  v0650Chapter7InteractBase(action);
};

const v0650Chapter7UpdateBase = update;
update = function(dt) {
  prepareSystems();
  v0650Chapter7UpdateBase(dt);

  if (
    !state ||
    mode !== "game" ||
    dialog ||
    transitionBusy ||
    !$("overlay").hidden ||
    state.gameOver ||
    state.dawnCollapse?.active ||
    state.wakeUp?.active ||
    state.copyFather?.phase !== "chase"
  ) {
    return;
  }

  const e = state.copyFather;

  if (e.room !== state.room) {
    e.followDelay += dt;

    if (e.followDelay >= 0.9) {
      e.room = state.room;
      e.followDelay = 0;

      const m = maps[state.room];

      e.x = Math.max(
        housePoint(70),
        Math.min(
          m.w - housePoint(70),
          state.x + (
            state.facing === "left"
              ? housePoint(115)
              : -housePoint(115)
          )
        )
      );

      e.y = Math.max(
        housePoint(70),
        Math.min(
          m.h - housePoint(70),
          state.y + housePoint(25)
        )
      );
    }

    return;
  }

  const dx = state.x - e.x;
  const dy = state.y - e.y;
  const distance = Math.hypot(dx, dy) || 1;

  if (distance < housePoint(26)) {
    v0650FatherCaught();
    return;
  }

  const speed = 68;
  const step = Math.min(
    distance,
    speed * dt
  );

  const stepX = dx / distance * step;
  const stepY = dy / distance * step;

  if (!solid(e.x + stepX, e.y)) {
    e.x += stepX;
  }

  if (!solid(e.x, e.y + stepY)) {
    e.y += stepY;
  }
};

const v0650Chapter7DrawBase = drawWorld;
drawWorld = function() {
  v0650Chapter7DrawBase();

  if (!state) return;

  if (
    ["inside", "suspect", "chase"].includes(
      state.copyFather?.phase
    ) &&
    state.copyFather.room === state.room
  ) {
    c.save();
    c.translate(
      -Math.floor(camera.x),
      -Math.floor(camera.y)
    );

    person(
      state.copyFather.x,
      state.copyFather.y,
      "father",
      state.copyFather.phase === "chase"
        ? elapsed * 10
        : 0,
      "left",
      1
    );

    c.restore();
  }

  if (
    state.chapter7?.brotherFollowing &&
    state.room !== "brother"
  ) {
    c.save();
    c.translate(
      -Math.floor(camera.x),
      -Math.floor(camera.y)
    );

    const bx =
      state.x +
      (state.facing === "left" ? 22 : -22);
    const by = state.y + 12;

    person(
      bx,
      by,
      "brother",
      state.walk,
      state.facing,
      0.8
    );

    c.restore();
  }

  if (
    state.copyFather?.phase === "chase" &&
    !["village", "oldRoad", "westRoad", "square"].includes(
      state.room
    )
  ) {
    rect(
      0, 0, W, H,
      "rgba(5,7,10,0.16)"
    );
  }

  if (elapsed < v0650CopyStaticUntil) {
    for (let i = 0; i < 26; i++) {
      const y =
        (i * 17 + Math.floor(elapsed * 760) % H) % H;

      rect(
        0,
        y,
        W,
        1 + (i % 3 === 0 ? 1 : 0),
        "rgba(230,232,225,0.11)"
      );
    }
  }
};

const v0650Chapter7HudBase = updateHud;
updateHud = function() {
  v0650Chapter7HudBase();

  if (
    !state ||
    state.stage === "prologue" ||
    !v0650Chapter7Unlocked()
  ) {
    return;
  }

  if (state.chapter7.complete) {
    if (state.day < 17) {
      $("objective").textContent =
        "A cópia foi embora. A casa continua escondendo alguma coisa.";
    }
    return;
  }

  if (state.copyFather.phase === "pending") {
    $("objective").textContent =
      "Alguém está batendo na porta de entrada.";
    return;
  }

  if (
    state.copyFather.phase === "inside" &&
    !state.chapter7.brotherWarned
  ) {
    $("objective").textContent =
      "Converse com seu irmão.";
    return;
  }

  if (state.copyFather.phase === "suspect") {
    $("objective").textContent =
      "Use a fotografia para verificar quem voltou.";
    return;
  }

  if (state.copyFather.phase === "chase") {
    $("objective").textContent =
      state.chapter7.brotherFollowing
        ? "Leve seu irmão ao sótão e encontre um esconderijo."
        : "Encontre seu irmão antes que ele te alcance.";
  }
};


// =========================================================
// 0.6.50 — CAPÍTULO 8 "O QUE FICA PERTO DE CASA"
// FLORINDA + SÓTÃO + ARMÁRIO/PASSAGEM + SPLIT
// =========================================================

const V0650_ATTIC_AXIS_POS = {
  x: housePoint(505),
  y: housePoint(205)
};

const V0650_BASEMENT_HOLE_POS = {
  x: housePoint(525),
  y: housePoint(165)
};

let v0650BasementObserverUntil = 0;
let v0650BasementObserverStaticUntil = 0;

function v0650Chapter8Unlocked() {
  return Boolean(
    state &&
    state.day >= 17 &&
    state.chapter7?.complete
  );
}

const v0650Chapter8PrepareBase = prepareSystems;
prepareSystems = function() {
  v0650Chapter8PrepareBase();

  if (!state) return;

  if (!state.chapter8 || typeof state.chapter8 !== "object") {
    state.chapter8 = {
      brotherEvidenceSeen: false,
      atticAxisFound: false,
      florindaConfronted: false,
      wheelchairLateLineSeen: false,
      splitRevealSeen: false,
      cabinetMoved: false,
      motherClueFound: false,
      complete: false
    };
  }

  for (const key of [
    "brotherEvidenceSeen",
    "atticAxisFound",
    "florindaConfronted",
    "wheelchairLateLineSeen",
    "splitRevealSeen",
    "cabinetMoved",
    "motherClueFound",
    "complete"
  ]) {
    if (typeof state.chapter8[key] !== "boolean") {
      state.chapter8[key] = false;
    }
  }

  if (typeof state.neighborKey !== "boolean") {
    state.neighborKey = false;
  }

  // O armário é um objeto físico persistente. Depois de empurrado,
  // muda de posição também ao recarregar o save.
  const cabinet = maps.basement?.objects.find(
    o => o.action === "basementCabinet"
  );

  if (cabinet) {
    cabinet.x = state.chapter8.cabinetMoved
      ? housePoint(350)
      : housePoint(455);
  }
};

function v0650BrotherFlorindaEvidence() {
  say(
    [
      ["Irmão", "Tem uma coisa que eu não te contei."],
      ["Você", "O quê?"],
      ["Irmão", "A Florinda entra aqui de noite às vezes."],
      ["Você", "Entra aqui?"],
      ["Irmão", "Eu ouço a porta. Depois ouço ela subindo."],
      ["Irmão", "Eu não contei porque acho que ela não quer que a gente saiba."]
    ],
    () => {
      state.chapter8.brotherEvidenceSeen = true;
      updateHud();
      save();
    }
  );
}

function v0650InspectAtticAxis() {
  if (state.chapter8.atticAxisFound) {
    say([
      "O espaço estreito desce por dentro da parede.",
      "Pela direção, termina exatamente acima do porão."
    ]);
    return;
  }

  say(
    [
      "Atrás dos móveis cobertos, a madeira da parede não acompanha o resto da casa.",
      "Há um vão estreito, antigo, descendo por dentro da estrutura.",
      "O ar sobe frio por ali.",
      "Se esse eixo continua reto, ele termina perto da parede do porão."
    ],
    () => {
      state.chapter8.atticAxisFound = true;
      v06Toast("Estrutura da casa registrada.", 2);
      updateHud();
      save();
    }
  );
}

function v0650ConfrontFlorinda() {
  if (state.chapter8.florindaConfronted) {
    say([
      ["Florinda", "Eu já te contei o que prometi."],
      ["Florinda", "A chave era da sua mãe. Eu só usei para trazer você de volta."]
    ]);
    return;
  }

  if (!state.chapter8.brotherEvidenceSeen) {
    say([
      ["Florinda", "Está tudo bem com seu irmão?"],
      ["Florinda", "Volte antes de amanhecer."]
    ]);
    return;
  }

  if (
    v0650EnsureInvestigationLog().contradictions.length < 3
  ) {
    say([
      ["Você", "Por que você sabe tanto sobre as sete?"],
      ["Florinda", "Porque eu me preocupo com vocês."],
      ["Florinda", "Isso é tudo que consigo te dizer agora."]
    ]);
    return;
  }

  say(
    [
      ["Você", "Você sabia. Sobre as sete horas. Sabia o tempo todo."],
      ["Florinda", "Eu prometi aos seus pais que não deixaria você lá fora quando isso acontecesse."],
      ["Você", "Isso não responde por que eu sempre acordo em casa sem lembrar de nada."],
      ["Florinda", "..."],
      ["Florinda", "Porque eu vou até você."],
      ["Florinda", "Uso a chave que sua mãe me deu. Eu te levo para dentro antes que alguém mais... note."],
      ["Você", "Note o quê?"],
      ["Florinda", "Eu não sei o nome disso."],
      ["Florinda", "Só sei que não posso deixar acontecer com você do jeito que seus pais temiam."],
      "Ela coloca uma chave na mesa.",
      ["Florinda", "Sua mãe me deu uma cópia. Fica com você agora."]
    ],
    () => {
      state.chapter8.florindaConfronted = true;
      state.neighborKey = true;
      v0650EnsureInvestigationLog().keyClues.florindaConfession = true;

      v06Toast(
        "Chave de Florinda adicionada ao inventário.",
        2.3
      );

      updateHud();
      save();
    }
  );
}

function v0650RaimundoSplitReveal() {
  if (state.chapter8.splitRevealSeen) {
    say([
      ["Raimundo", "Eu já te disse o nome. Split Lancaster."],
      ["Raimundo", "Se quer saber mais, vai ter que descobrir o que sua família guardou naquela casa."]
    ]);
    return;
  }

  say(
    [
      ["Raimundo", "Seu nome... seu sobrenome é bem familiar."],
      ["Raimundo", "Há quarenta anos eu trabalhava numa mina."],
      ["Raimundo", "O chefe de lá se chamava Lancaster. Split Lancaster."],
      ["Raimundo", "Duro. Não deixava passar erro nenhum."],
      ["Você", "Isso é... uma coincidência?"],
      ["Raimundo", "Eu já parei de acreditar em coincidência faz uns quarenta anos."]
    ],
    () => {
      state.chapter8.splitRevealSeen = true;
      v0650EnsureInvestigationLog().keyClues.splitReveal = true;

      v06Toast(
        "Nome registrado: Split Lancaster.",
        2.2
      );

      updateHud();
      save();
    }
  );
}

function v0650PushBasementCabinet() {
  if (
    !state.chapter8.atticAxisFound ||
    !state.chapter8.florindaConfronted
  ) {
    say([
      "O armário é pesado.",
      "Ainda não sei se vale a pena mexer nisso."
    ]);
    return;
  }

  if (state.chapter8.cabinetMoved) {
    say([
      "O armário continua afastado da parede.",
      "Atrás dele há uma abertura escura."
    ]);
    return;
  }

  say(
    [
      "Eu empurro o armário usando o ombro.",
      "A madeira raspa no chão exatamente sobre as marcas antigas.",
      "Atrás dele não há uma porta.",
      "Há uma abertura quebrada na parede, larga o bastante para uma pessoa passar abaixada."
    ],
    () => {
      state.chapter8.cabinetMoved = true;

      const cabinet = maps.basement.objects.find(
        o => o.action === "basementCabinet"
      );

      if (cabinet) {
        cabinet.x = housePoint(350);
      }

      v0650BasementObserverUntil = elapsed + 0.65;
      v0650BasementObserverStaticUntil = elapsed + 0.95;

      keys.clear();
      updateHud();
      save();
    }
  );
}

function v0650InspectBasementHole() {
  if (!state.chapter8.cabinetMoved) return;

  if (!state.chapter8.motherClueFound) {
    say(
      [
        "A passagem desce além do alcance da luz do porão.",
        "Na poeira da entrada há uma pegada menos coberta que o resto.",
        "O desenho da sola é igual ao das botas que minha mãe deixava perto da porta.",
        "Alguém passou por aqui depois do desaparecimento.",
        "Se foi ela... talvez ainda esteja viva."
      ],
      () => {
        state.chapter8.motherClueFound = true;
        state.chapter8.complete = true;

        v06Toast(
          "Capítulo 8 concluído · Há alguém sob a casa.",
          2.7
        );

        updateHud();
        save();
      }
    );
    return;
  }

  say([
    "A passagem continua no escuro.",
    "Minha lanterna será necessária lá embaixo.",
    "Antes de descer, preciso garantir que meu irmão fique seguro."
  ]);
}

const v0650Chapter8GetNearBase = getNear;
getNear = function() {
  prepareSystems();

  if (
    v0650Chapter8Unlocked() &&
    state.room === "attic" &&
    Math.hypot(
      state.x - V0650_ATTIC_AXIS_POS.x,
      state.y - V0650_ATTIC_AXIS_POS.y
    ) < 46
  ) {
    return {
      label: "Examinar a parede atrás dos móveis",
      action: "atticAxis"
    };
  }

  if (
    state.room === "basement" &&
    state.chapter8?.cabinetMoved &&
    Math.hypot(
      state.x - V0650_BASEMENT_HOLE_POS.x,
      state.y - V0650_BASEMENT_HOLE_POS.y
    ) < 50
  ) {
    return {
      label: "Examinar a abertura",
      action: "basementHole"
    };
  }

  return v0650Chapter8GetNearBase();
};

const v0650Chapter8InteractBase = interact;
interact = function(action) {
  prepareSystems();

  if (
    action === "brother" &&
    v0650Chapter8Unlocked() &&
    !state.chapter8.brotherEvidenceSeen
  ) {
    v0650BrotherFlorindaEvidence();
    return;
  }

  if (action === "atticAxis") {
    v0650InspectAtticAxis();
    return;
  }

  if (
    action === "vendor" &&
    v0650Chapter8Unlocked() &&
    state.chapter8.brotherEvidenceSeen
  ) {
    v0650ConfrontFlorinda();
    return;
  }

  if (
    action === "oldManTalk" &&
    v0650Chapter8Unlocked() &&
    state.chapter8.florindaConfronted
  ) {
    v0650RaimundoSplitReveal();
    return;
  }

  if (
    action === "basementCabinet" &&
    v0650Chapter8Unlocked()
  ) {
    v0650PushBasementCabinet();
    return;
  }

  if (action === "basementHole") {
    v0650InspectBasementHole();
    return;
  }

  if (
    action === "squareMan" &&
    v0650Chapter8Unlocked() &&
    state.chapter8.florindaConfronted &&
    !state.chapter8.wheelchairLateLineSeen
  ) {
    say(
      [
        ["Homem", "Ela cumpriu a palavra dela."],
        ["Você", "Você sabia?"],
        ["Homem", "Poucos cumprem."]
      ],
      () => {
        state.chapter8.wheelchairLateLineSeen = true;
        save();
      }
    );
    return;
  }

  v0650Chapter8InteractBase(action);
};

const v0650Chapter8DrawBase = drawWorld;
drawWorld = function() {
  v0650Chapter8DrawBase();

  if (!state) return;

  if (
    state.room === "basement" &&
    state.chapter8?.cabinetMoved
  ) {
    c.save();
    c.translate(
      -Math.floor(camera.x),
      -Math.floor(camera.y)
    );

    const hx = housePoint(475);
    const hy = housePoint(94);
    const hw = housePoint(82);
    const hh = housePoint(145);

    rect(hx, hy, hw, hh, "#07090a");
    rect(hx + 6, hy + 7, hw - 12, hh - 14, "#111517");
    rect(hx + 10, hy + 12, hw - 20, hh - 22, "#050607");

    if (elapsed < v0650BasementObserverUntil) {
      const ox = hx + hw * 0.52;
      const oy = hy + hh * 0.72;
      const jitter = Math.sin(elapsed * 51) * 1.5;

      rect(ox - 14 + jitter, oy - 13, 27, 10, "#010203");
      rect(ox - 9 - jitter, oy - 23, 18, 14, "#010203");
      rect(ox - 18, oy - 7, 11, 6, "#010203");
      rect(ox + 7, oy - 8, 12, 6, "#010203");
    }

    c.restore();
  }

  if (elapsed < v0650BasementObserverStaticUntil) {
    for (let i = 0; i < 30; i++) {
      const y =
        (i * 14 + Math.floor(elapsed * 820) % H) % H;

      rect(
        0,
        y,
        W,
        1 + (i % 4 === 0 ? 1 : 0),
        "rgba(232,235,228,0.12)"
      );
    }
  }
};

const v0650Chapter8HudBase = updateHud;
updateHud = function() {
  v0650Chapter8HudBase();

  if (
    !state ||
    state.stage === "prologue" ||
    !v0650Chapter8Unlocked()
  ) {
    return;
  }

  if (state.chapter8.complete) {
    $("objective").textContent =
      "A abertura atrás do armário leva ao subterrâneo. Preciso me preparar antes de descer.";
    return;
  }

  if (!state.chapter8.brotherEvidenceSeen) {
    $("objective").textContent =
      "Converse com seu irmão depois do que aconteceu.";
    return;
  }

  if (!state.chapter8.florindaConfronted) {
    $("objective").textContent =
      "Confronte Florinda sobre as sete horas.";
    return;
  }

  if (!state.chapter8.atticAxisFound) {
    $("objective").textContent =
      "Volte ao sótão e examine o lugar onde vocês se esconderam.";
    return;
  }

  if (!state.chapter8.cabinetMoved) {
    $("objective").textContent =
      "Volte ao porão e examine o armário contra a parede.";
    return;
  }

  if (!state.chapter8.motherClueFound) {
    $("objective").textContent =
      "Examine a abertura atrás do armário.";
  }
};



// =========================================================
// 0.7.0 — FUNDAÇÃO FINAL
// ECONOMIA, RELAÇÃO COM O IRMÃO, EVENTOS PEQUENOS E MISSÕES SECUNDÁRIAS
// =========================================================

const V070_FOOD_PRICE = 8;

const V070_RANDOM_EVENT_WEIGHTS = [
  { id: "van", weight: 18, minDay: 1 },
  { id: "voices", weight: 17, minDay: 1 },
  { id: "knock", weight: 12, minDay: 2 },
  { id: "blackout", weight: 10, minDay: 2 },
  { id: "windowLight", weight: 10, minDay: 3 },
  { id: "brotherEcho", weight: 7, minDay: 4 },
  { id: "foundFood", weight: 3, minDay: 2 },
  { id: "burntSmell", weight: 8, minDay: 6 },
  { id: "invasion", weight: 8, minDay: 5, needsFinished: true }
];

let v070WindowLightUntil = 0;
let v070RadioStaticUntil = 0;

function v070EnsureFinalSystems() {
  if (!state) return;

  if (!Number.isFinite(state.money)) {
    state.money = 0;
  }

  if (typeof state.walletFound !== "boolean") {
    state.walletFound = false;
  }

  if (!state.relationship || typeof state.relationship !== "object") {
    state.relationship = {
      brotherCare: 0,
      brotherTrust: 0,
      brotherNeglect: 0,
      toyReturned: false,
      protectedDuringReturn: Boolean(state.chapter7?.complete)
    };
  }

  for (const key of [
    "brotherCare",
    "brotherTrust",
    "brotherNeglect"
  ]) {
    if (!Number.isFinite(state.relationship[key])) {
      state.relationship[key] = 0;
    }
  }

  for (const key of [
    "toyReturned",
    "protectedDuringReturn"
  ]) {
    if (typeof state.relationship[key] !== "boolean") {
      state.relationship[key] = false;
    }
  }

  if (state.chapter7?.complete) {
    state.relationship.protectedDuringReturn = true;
    state.relationship.brotherTrust = Math.max(
      state.relationship.brotherTrust,
      2
    );
  }

  if (!state.sideQuests || typeof state.sideQuests !== "object") {
    state.sideQuests = {};
  }

  if (!state.sideQuests.squareMemory || typeof state.sideQuests.squareMemory !== "object") {
    state.sideQuests.squareMemory = {
      resolved: false,
      rewardTaken: false
    };
  }

  if (!state.sideQuests.brotherToy || typeof state.sideQuests.brotherToy !== "object") {
    state.sideQuests.brotherToy = {
      found: false,
      returned: false
    };
  }

  if (!state.sideQuests.westCase || typeof state.sideQuests.westCase !== "object") {
    state.sideQuests.westCase = {
      garciaStatement: false,
      evidenceFound: false,
      resolved: false,
      osvaldoNamed: false
    };
  }

  if (!state.sideQuests.policeInsight || typeof state.sideQuests.policeInsight !== "object") {
    state.sideQuests.policeInsight = {
      resolved: false
    };
  }

  if (!state.homeAtmosphere || typeof state.homeAtmosphere !== "object") {
    state.homeAtmosphere = {
      pendingRadio: false,
      pendingKnock: false,
      timer: 0
    };
  }

  if (typeof state.homeAtmosphere.pendingRadio !== "boolean") {
    state.homeAtmosphere.pendingRadio = false;
  }

  if (typeof state.homeAtmosphere.pendingKnock !== "boolean") {
    state.homeAtmosphere.pendingKnock = false;
  }

  if (!state.smallEventState || typeof state.smallEventState !== "object") {
    state.smallEventState = {
      pending: false,
      timer: 0,
      type: null
    };
  }
}

const v070PrepareBase = prepareSystems;
prepareSystems = function() {
  v070PrepareBase();
  v070EnsureFinalSystems();
};

function v070KeyClueCount() {
  prepareSystems();

  const clues =
    state.investigationLog?.keyClues || {};

  return [
    clues.marketConfirmed,
    clues.policeContradiction,
    clues.fatherNotebook,
    clues.photoCopy,
    clues.florindaConfession,
    clues.splitReveal
  ].filter(Boolean).length;
}

function v070BrotherBond() {
  prepareSystems();

  const r = state.relationship;

  let score =
    r.brotherCare +
    r.brotherTrust -
    r.brotherNeglect;

  if (r.toyReturned) score += 1;
  if (r.protectedDuringReturn) score += 2;
  if (state.chapter7?.photoCompared) score += 1;

  return score;
}

const v070FeedBrotherBase = v06FeedBrother;
v06FeedBrother = function() {
  const result = v070FeedBrotherBase();

  if (result && state) {
    v070EnsureFinalSystems();
    state.relationship.brotherCare += 1;
    save();
  }

  return result;
};

function v070FindWallet() {
  prepareSystems();

  if (state.walletFound) {
    say([
      "A carteira do meu pai está vazia. Eu já peguei o que havia nela."
    ]);
    return;
  }

  say(
    [
      "A carteira do meu pai ficou esquecida entre alguns papéis.",
      "Tem R$ 32 dentro. Não é muito, mas pode comprar comida por alguns dias.",
      "Não vai aparecer dinheiro novo aqui amanhã."
    ],
    () => {
      state.walletFound = true;
      state.money += 32;
      v06Toast("Carteira do pai · R$ 32", 2.2);
      updateHud();
      save();
    }
  );
}

function v070OpenMarketMenu() {
  prepareSystems();

  const buttons = [];

  if (
    state.food <= 0 &&
    state.money >= V070_FOOD_PRICE
  ) {
    buttons.push([
      "Comprar comida · R$ " + V070_FOOD_PRICE,
      () => {
        closeModal();

        state.money -= V070_FOOD_PRICE;
        state.food = 1;

        say(
          [
            ["Funcionário", "Aqui. É o que dá pra levar sem estragar."],
            ["Você", "Obrigado."]
          ],
          () => {
            updateHud();
            save();
          }
        );
      }
    ]);
  }

  if (state.food > 0) {
    buttons.push([
      "Já estou carregando comida",
      closeModal
    ]);
  } else if (state.money < V070_FOOD_PRICE) {
    buttons.push([
      "Sem dinheiro suficiente",
      closeModal
    ]);
  }

  buttons.push([
    "Perguntar sobre meus pais",
    () => {
      closeModal();
      say([
        ["Funcionário", "Eles vieram juntos e saíram juntos."],
        ["Funcionário", "Seu pai perguntou sobre a estrada do sul. Depois disso eu não vi nenhum dos dois."]
      ]);
    }
  ]);

  buttons.push(["Sair", closeModal]);

  modal(
    "Mercado de Forgotten",
    "Dinheiro: R$ " + state.money,
    buttons
  );
}

function v070ResolveSquareSideQuest() {
  prepareSystems();

  const quest = state.sideQuests.squareMemory;

  if (quest.resolved) {
    say([
      ["Morador", "A placa continua ali. Pelo menos alguma coisa ainda fica no lugar."]
    ]);
    return;
  }

  if (!v0650HasContradiction("squareFountain")) {
    say([
      ["Morador", "Eu sei o que eu lembro. Só não sei por que aquela placa me incomoda tanto."]
    ]);
    return;
  }

  say(
    [
      ["Você", "A placa está ali desde 1987. Você lembra que instalaram a fonte há dois anos."],
      ["Morador", "...Eu consigo lembrar dos dois dias."],
      ["Você", "Os dois não podem ter acontecido."],
      ["Morador", "Então guarda isso escrito. Não deixa alguém te convencer depois."],
      ["Morador", "Toma. Eu ia gastar no baralho mesmo."]
    ],
    () => {
      quest.resolved = true;
      quest.rewardTaken = true;
      state.money += 6;
      v06Toast("Missão secundária concluída · +R$ 6", 2.3);
      updateHud();
      save();
    }
  );
}

function v070FindBrotherToy() {
  prepareSystems();

  const quest = state.sideQuests.brotherToy;

  if (quest.found) {
    say(["Não tem mais nada aqui."]);
    return;
  }

  say(
    [
      "Um carrinho pequeno está preso embaixo do banco.",
      "É do meu irmão. Ele procurou isso por semanas."
    ],
    () => {
      quest.found = true;
      v06Toast("Item encontrado · carrinho do seu irmão", 2.1);
      save();
    }
  );
}

function v070ReturnBrotherToy() {
  prepareSystems();

  const quest = state.sideQuests.brotherToy;

  if (!quest.found || quest.returned) {
    return false;
  }

  say(
    [
      ["Você", "Olha o que eu achei na praça."],
      ["Irmão", "Meu carrinho! Eu achei que tinha perdido pra sempre."],
      ["Você", "Guarda melhor dessa vez."],
      ["Irmão", "Eu vou guardar. Prometo."]
    ],
    () => {
      quest.returned = true;
      state.relationship.toyReturned = true;
      state.relationship.brotherTrust += 1;
      v06Toast("Seu irmão vai lembrar disso.", 2);
      save();
    }
  );

  return true;
}

function v070GarciaStatement() {
  prepareSystems();

  const quest = state.sideQuests.westCase;

  if (quest.garciaStatement) {
    say([
      ["Garcia", "Eu encontrei o corpo. Não matei aquele homem."],
      ["Garcia", "Mexer na cena foi a pior coisa que eu podia ter feito. Eu sei."]
    ]);
    return;
  }

  say(
    [
      ["Você", "Você estava mexendo no corpo quando eu cheguei."],
      ["Garcia", "Eu sei como parece."],
      ["Garcia", "Eu encontrei ele ali. Já estava morto."],
      ["Você", "Então por que arrastou o corpo?"],
      ["Garcia", "Porque eu entrei em pânico. Tenho passagem na polícia. Achei que iam colocar aquilo nas minhas costas."],
      ["Garcia", "Eu tentei tirar ele da minha propriedade e só deixei tudo pior."],
      ["Você", "Você correu atrás de mim."],
      ["Garcia", "Porque você me viu fazendo a coisa mais idiota da minha vida."]
    ],
    () => {
      quest.garciaStatement = true;
      save();
    }
  );
}

function v070WestEvidence() {
  prepareSystems();

  const quest = state.sideQuests.westCase;

  if (quest.evidenceFound) {
    say([
      "O pedaço de nota continua guardado comigo."
    ]);
    return;
  }

  say(
    [
      "Entre o meio-fio e a terra há um pedaço de papel preso.",
      "É parte de uma nota de serviço. Só restaram uma inicial, um telefone e manchas de óleo.",
      "Não prova quem matou o homem, mas não combina com nada que Garcia carrega."
    ],
    () => {
      quest.evidenceFound = true;
      v06Toast("Evidência opcional registrada.", 2);
      save();
    }
  );
}

function v070ResolveWestCase() {
  prepareSystems();

  const quest = state.sideQuests.westCase;

  if (quest.resolved) {
    say([
      ["Anísio", "A morte da rua oeste está separada do caso dos seus pais."],
      ["Anísio", "Garcia encobriu a cena, mas não foi ele quem matou aquele homem."]
    ]);
    return;
  }

  if (!quest.garciaStatement || !quest.evidenceFound) {
    say([
      ["Anísio", "Se quer que eu reabra essa linha, traga algo além da palavra do Garcia."]
    ]);
    return;
  }

  say(
    [
      ["Você", "Garcia disse que encontrou o corpo. E achei isso perto da rua."],
      ["Anísio", "Uma nota de serviço... espera."],
      ["Anísio", "Esse telefone é de Osvaldo Ferreira."],
      ["Você", "Quem é ele?"],
      ["Anísio", "Faz bicos pela região. E devia dinheiro à vítima."],
      ["Anísio", "Nós conferimos a oficina dele. O sangue encontrado lá bate com o da vítima."],
      ["Você", "Então foi ele."],
      ["Anísio", "Foi. Uma briga saiu do controle. Garcia encontrou o corpo depois e tentou esconder o problema do jeito mais estúpido possível."],
      ["Anísio", "Isso aqui é humano. Não misture com o resto do seu caso."]
    ],
    () => {
      quest.resolved = true;
      quest.osvaldoNamed = true;
      v06Toast("Missão secundária concluída · Osvaldo identificado", 2.6);
      save();
    }
  );
}

function v070PoliceInsight() {
  prepareSystems();

  const quest = state.sideQuests.policeInsight;

  if (quest.resolved) {
    say([
      ["Anísio", "Eu continuo sem uma explicação. Só parei de fingir que está tudo normal."]
    ]);
    return;
  }

  say(
    [
      ["Anísio", "Eu reli meus próprios relatórios."],
      ["Anísio", "Tem frase minha que eu não lembro de escrever. Tem horário que muda entre uma cópia e outra."],
      ["Você", "Então acredita em mim?"],
      ["Anísio", "Eu acredito que alguma coisa em Forgotten não fecha."],
      ["Anísio", "Isso é o máximo que eu consigo colocar num relatório sem mentir."]
    ],
    () => {
      quest.resolved = true;
      save();
    }
  );
}

function v070OpenPoliceTopics() {
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
      "Falar do Raimundo",
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

  if (state.chapter4?.bodySeen) {
    buttons.push([
      "Falar da rua oeste",
      () => {
        closeModal();
        v0649PoliceBody();
      }
    ]);
  }

  if (v0650Chapter5Unlocked()) {
    buttons.push([
      v0650HasContradiction("policeRecord")
        ? "Rever o registro estranho"
        : "Conferir um relatório",
      () => {
        closeModal();
        v0650PoliceContradiction();
      }
    ]);
  }

  if (
    state.sideQuests.westCase.garciaStatement ||
    state.sideQuests.westCase.evidenceFound
  ) {
    buttons.push([
      "Reabrir o caso da rua oeste",
      () => {
        closeModal();
        v070ResolveWestCase();
      }
    ]);
  }

  if (
    state.chapter8?.complete
  ) {
    buttons.push([
      "Perguntar o que Anísio realmente pensa",
      () => {
        closeModal();
        v070PoliceInsight();
      }
    ]);
  }

  buttons.push(["Sair", closeModal]);

  modal(
    "Delegacia",
    "",
    buttons
  );
}

v0630OpenPoliceTopics = v070OpenPoliceTopics;

function v070WeightedEvent() {
  const candidates =
    V070_RANDOM_EVENT_WEIGHTS.filter(item =>
      state.day >= item.minDay &&
      (!item.needsFinished || state.finished)
    );

  const total = candidates.reduce(
    (sum, item) => sum + item.weight,
    0
  );

  let roll = Math.random() * total;

  for (const item of candidates) {
    roll -= item.weight;
    if (roll <= 0) return item.id;
  }

  return candidates[0]?.id || "voices";
}

v0645ScheduleOutingEvent = function() {
  prepareSystems();

  const majorPool = [
    "van",
    "voices",
    "knock",
    "blackout"
  ];

  if (state.finished) {
    majorPool.push("invasion");
  }

  state.randomEventState.pending = true;
  state.randomEventState.timer =
    7 + Math.random() * 9;
  state.randomEventState.type =
    majorPool[
      Math.floor(
        Math.random() * majorPool.length
      )
    ];

  const smallCandidates =
    V070_RANDOM_EVENT_WEIGHTS.filter(item =>
      ["windowLight", "brotherEcho", "foundFood", "burntSmell"].includes(item.id) &&
      state.day >= item.minDay
    );

  if (
    smallCandidates.length &&
    Math.random() < 0.56
  ) {
    const total = smallCandidates.reduce(
      (sum, item) => sum + item.weight,
      0
    );

    let roll =
      Math.random() * total;

    let selected =
      smallCandidates[0].id;

    for (const item of smallCandidates) {
      roll -= item.weight;

      if (roll <= 0) {
        selected = item.id;
        break;
      }
    }

    state.smallEventState.pending = true;
    state.smallEventState.timer =
      4 + Math.random() * 9;
    state.smallEventState.type =
      selected;
  } else {
    state.smallEventState.pending = false;
  }

  save();
};

const v070TriggerRandomBase = v0645TriggerRandomEvent;
v0645TriggerRandomEvent = function() {
  prepareSystems();

  const event = state.randomEventState;

  if (!event?.pending) return;

  if (event.type === "windowLight") {
    event.pending = false;
    v070WindowLightUntil = elapsed + 5;

    v06Toast(
      "Uma janela acendeu numa casa vazia. A luz apagou quando você olhou.",
      2.8
    );

    save();
    return;
  }

  if (event.type === "burntSmell") {
    event.pending = false;

    v06Toast(
      "Cheiro de queimado. Não há fumaça, fogo ou fonte alguma por perto.",
      2.8
    );

    save();
    return;
  }

  if (event.type === "brotherEcho") {
    event.pending = false;

    v06Toast(
      "Por um instante, pareceu que seu irmão chamou seu nome de muito longe.",
      2.8
    );

    state.pendingBrotherRemark =
      "Eu também achei que ouvi você me chamando. Mas você estava fora.";

    save();
    return;
  }

  if (event.type === "foundFood") {
    event.pending = false;

    if (state.food <= 0) {
      state.food = 1;

      v06Toast(
        "Uma embalagem lacrada ficou esquecida perto de uma caixa. Ainda está própria para levar.",
        2.8
      );
    } else {
      v06Toast(
        "Há uma embalagem de comida esquecida aqui, mas você já carrega uma porção.",
        2.6
      );
    }

    save();
    return;
  }

  v070TriggerRandomBase();
};

function v070TriggerHomeRadio() {
  prepareSystems();

  state.homeAtmosphere.pendingRadio = false;
  state.homeAtmosphere.timer = 0;

  v070RadioStaticUntil = elapsed + 1.4;
  v06Toast(
    "O rádio mudou de estação sozinho. Só há estática.",
    2.5
  );

  save();
}

const v070GoBase = go;
go = function(nextRoom, x, y) {
  const comingHome =
    state &&
    state.room === "village" &&
    nextRoom === "foyer" &&
    state.day >= 8;

  v070GoBase(nextRoom, x, y);

  if (
    comingHome &&
    Math.random() < 0.28
  ) {
    prepareSystems();

    const knock =
      state.day >= 2 &&
      Math.random() < 0.35;

    state.homeAtmosphere.pendingRadio =
      !knock;
    state.homeAtmosphere.pendingKnock =
      knock;
    state.homeAtmosphere.timer =
      1.8 + Math.random() * 1.8;
  }
};

const V070_TOY_POS = {
  x: 705,
  y: 585
};

const V070_WEST_EVIDENCE_POS = {
  x: 250,
  y: 410
};

const V070_GARCIA_AFTER_POS = {
  x: 350,
  y: 355
};

const v070GetNearBase = getNear;
getNear = function() {
  prepareSystems();

  if (
    state.room === "parents" &&
    !state.walletFound &&
    Math.hypot(
      state.x - housePoint(515),
      state.y - housePoint(205)
    ) < 44
  ) {
    return {
      label: "Examinar a carteira",
      action: "fatherWallet"
    };
  }

  if (
    state.room === "square" &&
    state.day >= 3 &&
    !state.sideQuests.brotherToy.found &&
    Math.hypot(
      state.x - V070_TOY_POS.x,
      state.y - V070_TOY_POS.y
    ) < 38
  ) {
    return {
      label: "Pegar o objeto embaixo do banco",
      action: "brotherToy"
    };
  }

  if (
    state.room === "square" &&
    v0650HasContradiction("squareFountain") &&
    !state.sideQuests.squareMemory.resolved &&
    Math.hypot(
      state.x - V0650_SQUARE_RESIDENT.x,
      state.y - V0650_SQUARE_RESIDENT.y
    ) < 42
  ) {
    return {
      label: "Mostrar a placa ao morador",
      action: "squareMemoryResolve"
    };
  }

  if (
    state.room === "westRoad" &&
    state.day >= 9 &&
    state.chapter4?.bodyReported &&
    !state.sideQuests.westCase.garciaStatement &&
    Math.hypot(
      state.x - V070_GARCIA_AFTER_POS.x,
      state.y - V070_GARCIA_AFTER_POS.y
    ) < 48
  ) {
    return {
      label: "Falar com Garcia",
      action: "garciaStatement"
    };
  }

  if (
    state.room === "westRoad" &&
    state.day >= 9 &&
    state.chapter4?.bodyReported &&
    !state.sideQuests.westCase.evidenceFound &&
    Math.hypot(
      state.x - V070_WEST_EVIDENCE_POS.x,
      state.y - V070_WEST_EVIDENCE_POS.y
    ) < 42
  ) {
    return {
      label: "Examinar o meio-fio",
      action: "westCaseEvidence"
    };
  }

  return v070GetNearBase();
};

const v070InteractBase = interact;
interact = function(action) {
  prepareSystems();

  if (action === "fatherWallet") {
    v070FindWallet();
    return;
  }

  if (
    action === "marketClerk" &&
    state.storyFlags?.marketParentsConfirmed &&
    (
      !v0650Chapter5Unlocked() ||
      state.memoryFacts?.marketTimeChecked
    )
  ) {
    v070OpenMarketMenu();
    return;
  }

  if (action === "brotherToy") {
    v070FindBrotherToy();
    return;
  }

  if (action === "squareMemoryResolve") {
    v070ResolveSquareSideQuest();
    return;
  }

  if (action === "garciaStatement") {
    v070GarciaStatement();
    return;
  }

  if (action === "westCaseEvidence") {
    v070WestEvidence();
    return;
  }

  if (
    action === "brother" &&
    state.sideQuests?.brotherToy?.found &&
    !state.sideQuests.brotherToy.returned
  ) {
    if (v070ReturnBrotherToy()) return;
  }

  v070InteractBase(action);
};

const v070InventoryBase = v0645OpenInventory;
v0645OpenInventory = function() {
  v070InventoryBase();

  if (!state) return;

  prepareSystems();

  const root = $("modalText");
  const economy = document.createElement("div");

  economy.style.marginTop = "12px";
  economy.textContent =
    "Dinheiro: R$ " + state.money;

  root.append(economy);

  if (
    state.sideQuests?.brotherToy?.found &&
    !state.sideQuests.brotherToy.returned
  ) {
    const toy = document.createElement("div");
    toy.textContent =
      "• Carrinho do seu irmão";
    root.append(toy);
  }

  if (
    state.sideQuests?.westCase?.evidenceFound &&
    !state.sideQuests.westCase.resolved
  ) {
    const evidence = document.createElement("div");
    evidence.textContent =
      "• Pedaço de nota da rua oeste";
    root.append(evidence);
  }
};


function v070TriggerHomeKnock() {
  prepareSystems();

  state.homeAtmosphere.pendingKnock = false;
  state.homeAtmosphere.timer = 0;

  modal(
    "TOC. TOC.",
    "Duas batidas secas na porta. Não há voz do outro lado.",
    [
      [
        "Abrir a porta",
        () => {
          closeModal();

          say([
            "O corredor está vazio.",
            "No chão há apenas marcas de barro que terminam antes da rua."
          ]);
        }
      ],
      [
        "Não abrir",
        () => {
          closeModal();

          say([
            "As batidas não se repetem.",
            "Depois de alguns segundos, o irmão volta a respirar normalmente."
          ]);
        }
      ]
    ]
  );
}

function v070TriggerSmallOutingEvent() {
  prepareSystems();

  if (!state.smallEventState?.pending) return;

  const small = {
    pending: true,
    type: state.smallEventState.type
  };

  state.smallEventState.pending = false;

  const original =
    state.randomEventState;

  state.randomEventState = small;
  v0645TriggerRandomEvent();
  state.randomEventState = original;

  save();
}

const v070UpdateBase = update;
update = function(dt) {
  prepareSystems();
  v070UpdateBase(dt);

  if (
    !state ||
    mode !== "game" ||
    dialog ||
    transitionBusy ||
    !$("overlay").hidden ||
    state.gameOver ||
    state.dawnCollapse?.active ||
    state.wakeUp?.active
  ) {
    return;
  }

  if (
    state.smallEventState?.pending &&
    state.room === "village" &&
    state.danger?.phase === "safe"
  ) {
    state.smallEventState.timer -= dt;

    if (state.smallEventState.timer <= 0) {
      v070TriggerSmallOutingEvent();
    }
  }

  if (
    (state.homeAtmosphere?.pendingRadio ||
      state.homeAtmosphere?.pendingKnock) &&
    !["village", "northRoad", "squareRoad", "square", "oldRoad", "westRoad", "market", "police"].includes(state.room)
  ) {
    state.homeAtmosphere.timer -= dt;

    if (state.homeAtmosphere.timer <= 0) {
      if (state.homeAtmosphere.pendingKnock) {
        v070TriggerHomeKnock();
      } else {
        v070TriggerHomeRadio();
      }

      return;
    }
  }
};

const v070DrawBase = drawWorld;
drawWorld = function() {
  v070DrawBase();

  if (!state) return;

  if (
    state.room === "westRoad" &&
    state.day >= 9 &&
    state.chapter4?.bodyReported &&
    !state.sideQuests?.westCase?.garciaStatement
  ) {
    c.save();
    c.translate(
      -Math.floor(camera.x),
      -Math.floor(camera.y)
    );

    person(
      V070_GARCIA_AFTER_POS.x,
      V070_GARCIA_AFTER_POS.y,
      "npcMale",
      0,
      "right",
      0.94
    );

    c.restore();
  }

  if (
    state.room === "square" &&
    state.day >= 3 &&
    !state.sideQuests?.brotherToy?.found
  ) {
    c.save();
    c.translate(
      -Math.floor(camera.x),
      -Math.floor(camera.y)
    );

    rect(
      V070_TOY_POS.x - 5,
      V070_TOY_POS.y - 3,
      10,
      6,
      "#6b4b36"
    );

    c.restore();
  }

  if (
    state.room === "village" &&
    elapsed < v070WindowLightUntil
  ) {
    c.save();
    c.translate(
      -Math.floor(camera.x),
      -Math.floor(camera.y)
    );

    rect(
      955,
      625,
      22,
      26,
      "rgba(215,190,125,0.75)"
    );

    c.restore();
  }

  if (elapsed < v070RadioStaticUntil) {
    for (let i = 0; i < 18; i++) {
      const y =
        (i * 19 + Math.floor(elapsed * 720) % H) % H;

      rect(
        0,
        y,
        W,
        1,
        "rgba(228,231,224,0.09)"
      );
    }
  }
};

const v070HudBase = updateHud;
updateHud = function() {
  v070HudBase();

  if (!state || state.stage === "prologue") return;

  prepareSystems();

  const current = $("inventory").textContent;

  if (!current.includes("R$")) {
    $("inventory").textContent =
      current + " · R$ " + state.money;
  }
};


// =========================================================
// 0.7.0 — PARTE FINAL
// CAPÍTULO 9 "A DESCIDA" + CAPÍTULO 10 "CASA DA MEMÓRIA" + 3 FINAIS
// =========================================================

if (!maps.undergroundPassage) {
  maps.undergroundPassage = {
    w: 2480,
    h: 460,
    objects: [
      obj(520, 95, 74, 82, "rock"),
      obj(815, 286, 95, 74, "rock"),
      obj(1145, 92, 88, 78, "rock"),
      obj(1515, 270, 110, 82, "rock"),
      obj(1915, 105, 82, 80, "rock")
    ],
    doors: []
  };
}
roomNames.undergroundPassage =
  "Passagem sob a casa";

if (!maps.mineDeep) {
  maps.mineDeep = {
    w: 1180,
    h: 760,
    objects: [
      obj(185, 120, 80, 95, "rock"),
      obj(365, 515, 120, 82, "rock"),
      obj(570, 125, 95, 78, "rock"),
      obj(780, 535, 110, 88, "rock"),
      obj(985, 140, 88, 105, "rock")
    ],
    doors: []
  };
}
roomNames.mineDeep =
  "Interior da antiga mina";

const V070_MOTHER_POS = {
  x: 735,
  y: 405
};

const V070_MINE_ANCHOR = {
  x: 960,
  y: 365
};

let v070DeepStaticUntil = 0;
let v070DeepObserverUntil = 0;
let v070MemoryStaticUntil = 0;

function v070Chapter9Unlocked() {
  return Boolean(
    state &&
    state.stage !== "prologue" &&
    state.day >= 20 &&
    state.chapter8?.complete
  );
}

const v070FinalPrepareBase = prepareSystems;
prepareSystems = function() {
  v070FinalPrepareBase();

  if (!state) return;

  v070EnsureFinalSystems();

  if (!state.chapter9 || typeof state.chapter9 !== "object") {
    state.chapter9 = {
      phase: "waiting",
      brotherPrepared: false,
      entered: false,
      tunnelSeen: false,
      motherMet: false,
      motherChoiceMade: false,
      motherStability: 0,
      observerSeen: false,
      memoryStarted: false,
      complete: false
    };
  }

  for (const key of [
    "brotherPrepared",
    "entered",
    "tunnelSeen",
    "motherMet",
    "motherChoiceMade",
    "observerSeen",
    "memoryStarted",
    "complete"
  ]) {
    if (typeof state.chapter9[key] !== "boolean") {
      state.chapter9[key] = false;
    }
  }

  if (!Number.isFinite(state.chapter9.motherStability)) {
    state.chapter9.motherStability = 0;
  }

  if (
    v070Chapter9Unlocked() &&
    state.chapter9.phase === "waiting"
  ) {
    state.chapter9.phase = "ready";
  }

  if (!state.memoryHouse || typeof state.memoryHouse !== "object") {
    state.memoryHouse = {
      active: false,
      phase: "idle",
      errors: 0,
      brotherLost: false,
      fatherAccepted: false,
      result: null,
      finished: false
    };
  }

  if (!Number.isFinite(state.memoryHouse.errors)) {
    state.memoryHouse.errors = 0;
  }

  for (const key of [
    "active",
    "brotherLost",
    "fatherAccepted",
    "finished"
  ]) {
    if (typeof state.memoryHouse[key] !== "boolean") {
      state.memoryHouse[key] = false;
    }
  }

  if (typeof state.memoryHouse.phase !== "string") {
    state.memoryHouse.phase = "idle";
  }

  if (!state.ending || typeof state.ending !== "object") {
    state.ending = {
      id: null,
      complete: false,
      epilogueSeen: false
    };
  }

  if (typeof state.ending.complete !== "boolean") {
    state.ending.complete = false;
  }

  if (typeof state.ending.epilogueSeen !== "boolean") {
    state.ending.epilogueSeen = false;
  }

  if (state.ending.complete) {
    state.memoryHouse.active = false;
  }
};

function v070PrepareBrotherForDescent() {
  prepareSystems();

  if (state.chapter9.brotherPrepared) {
    say([
      ["Irmão", "Eu vou ficar aqui. A Florinda sabe que você desceu."],
      ["Irmão", "Só volta."]
    ]);
    return;
  }

  say(
    [
      ["Você", "Eu achei uma passagem atrás do armário."],
      ["Irmão", "Você vai entrar?"],
      ["Você", "Vou. Mas você não vem comigo."],
      ["Irmão", "Eu não quero ficar sozinho."],
      ["Você", "A Florinda tem a chave. Se eu não voltar antes de clarear, vai para a casa dela."],
      ["Irmão", "Você promete que volta?"],
      ["Você", "Eu prometo que vou tentar."],
      ["Irmão", "...Não esquece de mim lá embaixo."]
    ],
    () => {
      state.chapter9.brotherPrepared = true;
      state.relationship.brotherTrust += 1;
      updateHud();
      save();
    }
  );
}

function v070EnterUnderground() {
  prepareSystems();

  if (!state.chapter9.brotherPrepared) {
    say([
      "Não vou desaparecer por um buraco sem dizer ao meu irmão onde estou indo."
    ]);
    return;
  }

  if (
    !state.flashlight?.owned
  ) {
    say([
      "Está escuro demais. Eu não vou entrar sem uma lanterna."
    ]);
    return;
  }

  if (
    state.flashlight.battery < 20
  ) {
    say([
      "A bateria está baixa demais para uma passagem dessas.",
      "Preciso trocar as pilhas antes de descer."
    ]);
    return;
  }

  state.chapter9.entered = true;
  state.chapter9.phase = "tunnel";
  state.flashlight.on = true;
  state.flashlight.emptyWarned = false;

  fade(
    "A Descida",
    "O ar fica mais frio depois dos primeiros metros.",
    () => {
      state.room = "undergroundPassage";
      state.x = 85;
      state.y = 230;
      state.facing = "right";
      state.walk = 0;

      keys.clear();
      near = null;
      updateHud();
      save();
    }
  );
}

function v070ReturnFromTunnel() {
  state.flashlight.on = false;

  fade(
    "",
    "",
    () => {
      state.room = "basement";
      state.x = housePoint(475);
      state.y = housePoint(175);
      state.facing = "left";
      state.walk = 0;

      keys.clear();
      near = null;
      updateHud();
      save();
    }
  );
}

function v070EnterMineDeep() {
  state.chapter9.tunnelSeen = true;
  state.chapter9.phase = "mine";
  state.flashlight.on = true;

  fade(
    "Interior da mina",
    "A parede de tijolos termina. Restam pedra, vigas e trilhos enferrujados.",
    () => {
      state.room = "mineDeep";
      state.x = 105;
      state.y = 390;
      state.facing = "right";
      state.walk = 0;

      keys.clear();
      near = null;

      v070DeepStaticUntil =
        elapsed + 0.55;

      updateHud();
      save();
    }
  );
}

function v070MotherFirstConversation() {
  prepareSystems();

  if (state.chapter9.motherMet) {
    say([
      ["Mãe", "Eu lembro do seu rosto agora."],
      ["Mãe", "O resto vem e vai."]
    ]);
    return;
  }

  say(
    [
      ["Você", "Mãe...?"],
      ["Mãe", "..."],
      ["Você", "Mãe, sou eu."],
      ["Mãe", "Não chega perto."],
      ["Você", "Sou eu. Estevão."],
      ["Mãe", "Estevão..."],
      ["Mãe", "Filho?"],
      ["Você", "Eu te encontrei."],
      ["Mãe", "Você me encontrou..."],
      ["Mãe", "Meu Deus. Você me encontrou."],
      ["Mãe", "Me desculpa. Me desculpa por deixar você e seu irmão sozinhos esse tempo todo."]
    ],
    v070MotherMemoryChoice
  );
}

function v070MotherMemoryChoice() {
  modal(
    "Ela está tentando se lembrar",
    "A respiração dela acelera quando tenta organizar os últimos dias numa sequência.",
    [
      [
        "“Não precisa lembrar de tudo agora.”",
        () => {
          closeModal();

          state.chapter9.motherChoiceMade = true;
          state.chapter9.motherStability += 2;

          say(
            [
              ["Mãe", "Foi isso que eu fiz comigo."],
              ["Mãe", "Parei de contar os dias. Parei de repetir a sequência das coisas."],
              ["Mãe", "Quando uma lembrança vinha inteira, eu soltava antes de encaixar a próxima."],
              ["Você", "Você fez isso de propósito?"],
              ["Mãe", "No começo, não. Depois eu percebi que ele me perdia quando eu parava de sustentar uma história inteira sobre quem eu era."]
            ],
            v070MotherFatherQuestion
          );
        }
      ],
      [
        "“Você é minha mãe. Tenta lembrar.”",
        () => {
          closeModal();

          state.chapter9.motherChoiceMade = true;
          state.chapter9.motherStability -= 1;

          say(
            [
              ["Mãe", "Não. Se eu junto tudo... ele encontra o caminho de volta."],
              ["Você", "Quem?"],
              ["Mãe", "Eu não consigo manter uma história inteira na cabeça. Foi assim que eu fiquei escondida."]
            ],
            v070MotherFatherQuestion
          );
        }
      ]
    ]
  );
}

function v070MotherFatherQuestion() {
  say(
    [
      ["Você", "Cadê o pai?"],
      ["Mãe", "Eu... não sei."],
      ["Mãe", "A última coisa que eu lembro direito é dele comigo."],
      ["Mãe", "Depois eu acordei aqui."],
      ["Mãe", "Seu pai não estava aqui. Ele sumiu."],
      "...",
      "A lâmpada da lanterna chia.",
      ["Mãe", "Não olha para o poço."]
    ],
    () => {
      state.chapter9.motherMet = true;
      state.chapter9.phase = "anchor";
      state.chapter9.observerSeen = true;

      v070DeepObserverUntil =
        elapsed + 2.3;
      v070DeepStaticUntil =
        elapsed + 1.45;

      keys.clear();
      updateHud();
      save();
    }
  );
}

function v070ApproachMineAnchor() {
  prepareSystems();

  if (!state.chapter9.motherMet) {
    say([
      "O ar perto do poço parece vibrar. Não vou chegar mais perto sozinho."
    ]);
    return;
  }

  if (state.chapter9.memoryStarted) {
    return;
  }

  say(
    [
      "O trilho termina diante do poço.",
      "A estática não vem só da lanterna. Vem das vigas, do metal e de dentro da minha cabeça.",
      ["Mãe", "Não tenta entender tudo de uma vez."],
      ["Mãe", "É assim que ele entra."],
      "A escuridão ao redor do poço parece se mover sem sair do lugar."
    ],
    () => {
      state.chapter9.memoryStarted = true;
      state.chapter9.phase = "memory";
      v070StartMemoryHouse();
    }
  );
}

function v070MemorySetPhase(phase) {
  state.memoryHouse.phase = phase;
  v070MemoryStaticUntil =
    elapsed + 0.65;
  keys.clear();
}

function v070StartMemoryHouse() {
  prepareSystems();

  state.memoryHouse.active = true;
  state.memoryHouse.phase = "v1";
  state.memoryHouse.errors = 0;
  state.memoryHouse.brotherLost = false;
  state.memoryHouse.fatherAccepted = false;
  state.memoryHouse.result = null;
  state.memoryHouse.finished = false;

  keys.clear();
  near = null;

  v070MemoryStaticUntil =
    elapsed + 0.85;

  v070MemoryVersion1();
}

function v070MemoryVersion1() {
  v070MemorySetPhase("v1");

  modal(
    "Casa da Memória · I",
    "A sala parece normal. Quase. A cadeira do seu pai está do lado errado da mesa. O relógio da sala está parado exatamente em 07:00.\n\nEstevão: “Isso... não tá certo.”",
    [
      [
        "Continuar",
        () => {
          closeModal();
          v070MemoryVersion2();
        }
      ]
    ]
  );
}

function v070MemoryVersion2() {
  v070MemorySetPhase("v2");

  const hasFlorinda =
    Boolean(
      state.investigationLog?.keyClues?.florindaConfession
    );

  const buttons = [];

  if (hasFlorinda) {
    buttons.push([
      "“Não. Foi a Florinda quem me contou.”",
      () => {
        closeModal();
        v070MemoryVersion3();
      }
    ]);
  } else {
    buttons.push([
      "“Isso não parece certo.”",
      () => {
        closeModal();
        state.memoryHouse.errors += 1;
        v070MemoryVersion3();
      }
    ]);
  }

  buttons.push([
    "“Foi o Anísio... eu acho.”",
    () => {
      closeModal();
      state.memoryHouse.errors += 1;
      v070MemoryVersion3();
    }
  ]);

  modal(
    "Casa da Memória · II",
    "Uma voz neutra fala como se estivesse lendo uma lembrança:\n\n“Foi o Sargento Anísio quem explicou por que você sempre acordava em casa às 00:00. Você lembra.”",
    buttons
  );
}

function v070MemoryVersion3() {
  v070MemorySetPhase("v3");

  const hasNotebook =
    Boolean(
      state.investigationLog?.keyClues?.fatherNotebook
    );

  const buttons = [];

  if (hasNotebook) {
    buttons.push([
      "“Eu li o caderno. Ele existia.”",
      () => {
        closeModal();
        v070MemoryVersion4();
      }
    ]);
  } else {
    buttons.push([
      "“Eu encontrei alguma coisa aqui. Eu sei disso.”",
      () => {
        closeModal();
        state.memoryHouse.errors += 1;
        v070MemoryVersion4();
      }
    ]);
  }

  buttons.push([
    "“Talvez eu só quisesse encontrar uma resposta.”",
    () => {
      closeModal();
      state.memoryHouse.errors += 1;
      v070MemoryVersion4();
    }
  ]);

  modal(
    "Casa da Memória · III",
    "O quarto dos pais está limpo demais. A mesa está vazia. Não existe fotografia. Não existe caderno.\n\nA voz diz: “Você nunca encontrou nada aqui. Você só queria encontrar.”",
    buttons
  );
}

function v070MemoryVersion4() {
  v070MemorySetPhase("v4");

  const bond =
    v070BrotherBond();

  const buttons = [];

  if (bond >= 3) {
    buttons.push([
      "“Eu cuidei dele. Eu ouvi os passos. Eu levei ele comigo quando a cópia entrou em casa.”",
      () => {
        closeModal();
        state.relationship.brotherTrust += 1;
        v070MemoryVersion5();
      }
    ]);
  } else {
    buttons.push([
      "“Eu lembro de cuidar de alguém. Essa lembrança é minha.”",
      () => {
        closeModal();
        state.memoryHouse.errors += 1;
        v070MemoryVersion5();
      }
    ]);
  }

  buttons.push([
    "“Talvez eu nunca tenha tido um irmão.”",
    () => {
      closeModal();
      state.memoryHouse.errors += 2;
      state.memoryHouse.brotherLost = true;
      v070MemoryVersion5();
    }
  ]);

  modal(
    "Casa da Memória · IV",
    "O quarto do seu irmão não tem cama pequena, brinquedos, roupas ou desenhos. É só um cômodo vazio.\n\nObservador: “Você nunca teve um irmão.”",
    buttons
  );
}

function v070MemoryVersion5() {
  v070MemorySetPhase("v5");

  const photoUsed =
    Boolean(
      state.investigationLog?.keyClues?.photoCopy
    );

  const buttons = [];

  if (photoUsed) {
    buttons.push([
      "“Essa tatuagem... você nunca teve isso.”",
      () => {
        closeModal();
        v070RejectFalseFather(true);
      }
    ]);
  } else {
    buttons.push([
      "“Você não é meu pai.”",
      () => {
        closeModal();
        state.memoryHouse.errors += 1;
        v070RejectFalseFather(false);
      }
    ]);
  }

  buttons.push([
    "Sentar com ele.",
    () => {
      closeModal();
      state.memoryHouse.fatherAccepted = true;
      v070ResolveMemoryHouse();
    }
  ]);

  modal(
    "Casa da Memória · V",
    "A sala fica quente, iluminada como uma tarde comum. Seu pai está na cadeira de sempre.\n\nPai: “Estevão. Vem cá, filho. Já passou. Você deve estar cansado de procurar.”\n\nQuando ele estende o braço para puxar uma cadeira, a manga sobe. Há uma tatuagem no antebraço.",
    buttons
  );
}

function v070RejectFalseFather(withPhoto) {
  v070MemorySetPhase("v5break");

  if (withPhoto) {
    modal(
      "A imagem racha",
      "Pai: “...Isso importa agora?”\n\nEstevão: “Importa. Porque você não é ele.”\n\nA estática rasga o rosto conhecido. Por baixo existe outro homem — parecido o bastante para ser família, mas não o pai de Estevão.\n\nObservador: “Você poderia ter ficado.”\n\nEstevão: “Eu sei o que eu perdi. Não preciso que você finja que devolveu.”",
      [
        [
          "Continuar",
          () => {
            closeModal();
            state.storyFlags.norbertoBodySeen = true;
            v070MemoryTrueVersion();
          }
        ]
      ]
    );
  } else {
    modal(
      "A imagem hesita",
      "A figura insiste que é seu pai. Você não tem a lembrança física certa para desmontar a mentira de imediato, mas recusa o convite.\n\nA sala racha em estática.",
      [
        [
          "Continuar",
          () => {
            closeModal();
            v070MemoryTrueVersion();
          }
        ]
      ]
    );
  }
}

function v070MemoryTrueVersion() {
  v070MemorySetPhase("true");

  const splitKnown =
    Boolean(
      state.investigationLog?.keyClues?.splitReveal
    );

  const originLine = splitKnown
    ? "As vozes da mina se sobrepõem. Entre elas, o nome Split Lancaster volta como um peso: o capataz que ignorou as rachaduras morreu com os homens que tentou controlar."
    : "As vozes da mina se sobrepõem. Um capataz mandando os homens continuarem, rachaduras sendo ignoradas, pedra cedendo. Algo ficou preso naquele instante.";

  modal(
    "A versão verdadeira",
    "A casa volta ao lugar por alguns segundos.\n\n" +
    originLine +
    "\n\nEstevão entende que aquilo não é um fantasma dos mortos. É o padrão que ficou quando várias identidades foram esmagadas juntas — uma coisa que aprendeu a existir dentro da diferença entre lembrança e fato.\n\nE entende as 07h: ele não conseguiu substituir Estevão de uma vez. Então repetiu um horário, noite após noite, até o corpo começar a obedecer.",
    [
      [
        "Continuar",
        () => {
          closeModal();
          v070ResolveMemoryHouse();
        }
      ]
    ]
  );
}

function v070ResolveMemoryHouse() {
  prepareSystems();

  const memory =
    state.memoryHouse;

  const keyCount =
    v070KeyClueCount();

  const bond =
    v070BrotherBond();

  let result = "leftBehind";

  if (memory.fatherAccepted) {
    result = "leftBehind";
  } else if (
    memory.brotherLost ||
    bond < 2
  ) {
    result = "whoRemained";
  } else if (
    keyCount >= 5 &&
    state.chapter9.motherStability >= 1 &&
    memory.errors <= 1
  ) {
    result = "good";
  } else if (
    memory.errors >= 2 ||
    keyCount <= 4
  ) {
    result = "leftBehind";
  } else {
    result = "whoRemained";
  }

  memory.result = result;
  memory.finished = true;

  v070FinishGame(result);
}

function v070FinishGame(result) {
  state.memoryHouse.active = false;
  state.chapter9.complete = true;
  state.chapter9.phase = "complete";
  state.ending.id = result;
  state.ending.complete = true;
  state.finished = true;

  state.storyFlags.wheelchairGone = true;
  state.storyFlags.policeCaseArchived = true;

  state.flashlight.on = false;

  // Persiste o desfecho antes de abrir qualquer modal final.
  // Assim, fechar o navegador durante o epílogo não perde o resultado.
  save();

  if (result === "good") {
    state.storyFlags.motherRescued = true;
    state.storyFlags.fatherPermanentlyLost = true;
    save();

    v070EndingGood();
    return;
  }

  if (result === "whoRemained") {
    state.storyFlags.brotherLost = true;
    save();

    v070EndingWhoRemained();
    return;
  }

  state.storyFlags.estevaoLost = true;
  save();

  v070EndingLeftBehind();
}

function v070EndingGood() {
  modal(
    "A Casa que Restou",
    "A estática recua até virar apenas um chiado distante.\n\nA mãe reconhece o homem que apareceu sob o rosto do pai: Norberto Lancaster, irmão dele. O Observador usou um corpo da própria família para sustentar a cópia.\n\nO pai verdadeiro não volta. Não existe despedida escondida, cura ou segunda chance. O que resta é a certeza de que a voz usada na Casa da Memória não era dele.",
    [
      [
        "Continuar",
        () => {
          closeModal();

          modal(
            "Alguns dias depois",
            "Estevão, o irmão e a mãe deixam a passagem. Ela ainda perde pedaços de sequência e precisa reaprender a confiar nas próprias lembranças.\n\nO relógio parado da sala volta a funcionar depois que o irmão insiste em consertá-lo.\n\nNa praça, a cadeira do homem que sabia demais está vazia. Ninguém sabe para onde ele foi.\n\nAnísio arquiva o caso com uma explicação oficial que não combina totalmente com o que aconteceu.",
            [
              [
                "Continuar",
                () => {
                  closeModal();

                  modal(
                    "A Casa que Restou",
                    "O irmão observa a janela antes de dormir.\n\nIrmão: “Acha que ele ainda está olhando?”\n\nEstevão não responde.\n\nEm outra rua de Forgotten, uma família discute sobre uma lembrança pequena que nenhum dos dois consegue provar.",
                    [
                      [
                        "Encerrar",
                        () => {
                          state.ending.epilogueSeen = true;
                          v070ReturnToMenu();
                        }
                      ]
                    ]
                  );
                }
              ]
            ]
          );
        }
      ]
    ]
  );
}

function v070EndingWhoRemained() {
  modal(
    "Quem Restou",
    "A Casa da Memória volta ao lugar, mas um cômodo continua errado.\n\nQuando Estevão tenta dizer o nome do irmão, a palavra não encontra nada onde deveria se apoiar.\n\nA mãe pergunta de quem ele está falando.",
    [
      [
        "Continuar",
        () => {
          closeModal();

          modal(
            "Dias depois",
            "O quarto pequeno parece ter pertencido a outra coisa. Nenhuma fotografia prova o contrário com clareza suficiente.\n\nEstevão sabe que falta alguém. Às vezes lembra de uma voz, de um carrinho, de passos no corredor. As lembranças não encaixam mais umas nas outras.\n\nO Observador não matou uma criança diante dele. Fez algo pior: tornou a ausência plausível.",
            [
              [
                "Encerrar",
                () => {
                  state.ending.epilogueSeen = true;
                  v070ReturnToMenu();
                }
              ]
            ]
          );
        }
      ]
    ]
  );
}

function v070EndingLeftBehind() {
  modal(
    "O Que Ficou Para Trás",
    "A sala quente parece mais fácil do que a verdade.\n\nPor alguns segundos, Estevão aceita uma versão que gostaria que fosse real.\n\nA estática para.",
    [
      [
        "Continuar",
        () => {
          closeModal();

          modal(
            "Depois",
            "A mãe e o irmão são encontrados, mas Estevão não está com eles.\n\nNão há corpo. Não há trilha de saída. Os registros da cidade discordam até sobre a última vez em que alguém o viu.\n\nEm alguns documentos, ele nunca chegou a entrar na mina.\n\nEm outros, o nome Estevão Lancaster aparece numa linha antiga demais para ser possível.",
            [
              [
                "Encerrar",
                () => {
                  state.ending.epilogueSeen = true;
                  v070ReturnToMenu();
                }
              ]
            ]
          );
        }
      ]
    ]
  );
}

function v070ReturnToMenu() {
  save();
  closeModal();

  mode = "menu";

  $("menu").hidden = false;
  $("hud").hidden = true;
  $("prompt").hidden = true;

  keys.clear();
}

const v070FinalGetNearBase = getNear;
getNear = function() {
  prepareSystems();

  if (
    state.room === "undergroundPassage"
  ) {
    if (state.x < 105) {
      return {
        label: "Voltar ao porão",
        action: "undergroundBack"
      };
    }

    if (state.x > 2335) {
      return {
        label: "Seguir para a mina",
        action: "undergroundMine"
      };
    }
  }

  if (
    state.room === "mineDeep"
  ) {
    if (
      !state.chapter9.motherMet &&
      Math.hypot(
        state.x - V070_MOTHER_POS.x,
        state.y - V070_MOTHER_POS.y
      ) < 55
    ) {
      return {
        label: "Falar com sua mãe",
        action: "mineMother"
      };
    }

    if (
      state.chapter9.motherMet &&
      !state.chapter9.memoryStarted &&
      Math.hypot(
        state.x - V070_MINE_ANCHOR.x,
        state.y - V070_MINE_ANCHOR.y
      ) < 78
    ) {
      return {
        label: "Aproximar-se do poço",
        action: "mineAnchor"
      };
    }
  }

  return v070FinalGetNearBase();
};

const v070FinalInteractBase = interact;
interact = function(action) {
  prepareSystems();

  if (
    action === "squareMan" &&
    v070Chapter9Unlocked() &&
    !state.chapter9.entered &&
    !state.storyFlags?.squareManDescentWarning
  ) {
    say(
      [
        ["Homem", "Ela se escondeu do jeito que só quem já foi criança sabe fazer."],
        ["Você", "Você está falando da minha mãe?"],
        ["Homem", "Espero que ela ainda lembre de você quando você chegar."]
      ],
      () => {
        state.storyFlags.squareManDescentWarning = true;
        save();
      }
    );
    return;
  }

  if (
    action === "brother" &&
    v070Chapter9Unlocked() &&
    !state.chapter9.brotherPrepared
  ) {
    v070PrepareBrotherForDescent();
    return;
  }

  if (
    action === "basementHole" &&
    v070Chapter9Unlocked() &&
    !state.chapter9.entered
  ) {
    v070EnterUnderground();
    return;
  }

  if (action === "undergroundBack") {
    v070ReturnFromTunnel();
    return;
  }

  if (action === "undergroundMine") {
    v070EnterMineDeep();
    return;
  }

  if (action === "mineMother") {
    v070MotherFirstConversation();
    return;
  }

  if (action === "mineAnchor") {
    v070ApproachMineAnchor();
    return;
  }

  v070FinalInteractBase(action);
};

function v070DrawTunnelWorld() {
  const m = maps.undergroundPassage;

  camera.x = Math.max(
    0,
    Math.min(
      m.w - W,
      state.x - W / 2
    )
  );

  camera.y = Math.max(
    0,
    Math.min(
      m.h - H,
      state.y - H / 2
    )
  );

  c.save();
  c.translate(
    -Math.floor(camera.x),
    -Math.floor(camera.y)
  );

  rect(0, 0, m.w, m.h, "#111315");
  rect(0, 85, m.w, 290, "#292724");
  rect(0, 375, m.w, 85, "#161718");

  // A passagem começa como fundação doméstica e vira mina aos poucos.
  for (let x = 0; x < 650; x += 36) {
    rect(x, 92, 2, 275, "#4a4038");
    rect(x, 92, 34, 3, "#5a4b40");
  }

  for (let x = 660; x < 1500; x += 95) {
    rect(x, 95, 9, 270, "#4a3f32");
    rect(x - 6, 98, 108, 8, "#584a38");
  }

  for (let x = 1510; x < m.w; x += 82) {
    rect(x, 115, 7, 250, "#3d342b");
    rect(x - 5, 112, 92, 7, "#4a3c30");
  }

  // Trilhos surgem perto do meio e seguem até a mina.
  for (let x = 1020; x < m.w; x += 34) {
    rect(x, 285, 24, 3, "#4f4b45");
  }

  rect(1000, 270, m.w - 1000, 4, "#66615a");
  rect(1000, 305, m.w - 1000, 4, "#66615a");

  for (const o of m.objects) {
    rect(o.x, o.y, o.w, o.h, "#363433");
    rect(o.x + 7, o.y + 8, Math.max(8, o.w - 14), Math.max(8, o.h - 16), "#242526");
  }

  txt(
    state.x < 700
      ? "FUNDAÇÃO ANTIGA"
      : state.x < 1550
        ? "GALERIA DE SERVIÇO"
        : "MINA",
    Math.max(28, state.x - 145),
    68,
    "#8d8678",
    7
  );

  person(
    state.x,
    state.y,
    "player",
    state.walk,
    state.facing
  );

  c.restore();

  v070DrawDeepDarkness();

  if (elapsed < v070DeepStaticUntil) {
    for (let i = 0; i < 20; i++) {
      const y =
        (i * 18 + Math.floor(elapsed * 760) % H) % H;

      rect(
        0,
        y,
        W,
        1,
        "rgba(230,233,225,0.08)"
      );
    }
  }
}

function v070DrawMineWorld() {
  const m = maps.mineDeep;

  camera.x = Math.max(
    0,
    Math.min(
      m.w - W,
      state.x - W / 2
    )
  );

  camera.y = Math.max(
    0,
    Math.min(
      m.h - H,
      state.y - H / 2
    )
  );

  c.save();
  c.translate(
    -Math.floor(camera.x),
    -Math.floor(camera.y)
  );

  rect(0, 0, m.w, m.h, "#0f1112");

  for (let y = 50; y < m.h; y += 48) {
    for (let x = 35; x < m.w; x += 58) {
      const h = hash(x, y);

      rect(
        x,
        y,
        22 + h * 28,
        5 + h * 6,
        h > 0.55 ? "#2f2e2c" : "#242526"
      );
    }
  }

  // Galeria principal.
  rect(55, 300, 1030, 205, "#292827");

  // Vigas de contenção.
  for (let x = 120; x < 1040; x += 135) {
    rect(x, 250, 10, 300, "#4a3d2f");
    rect(x - 10, 248, 145, 9, "#554535");
  }

  // Trilhos e dormentes.
  rect(70, 385, 930, 4, "#625e58");
  rect(70, 420, 930, 4, "#625e58");

  for (let x = 80; x < 1010; x += 38) {
    rect(x, 377, 26, 54, "#3e342b");
  }

  for (const o of m.objects) {
    rect(o.x, o.y, o.w, o.h, "#343231");
  }

  // Poço / ponto de ancoragem.
  c.beginPath();
  c.fillStyle = "#020304";
  c.arc(
    V070_MINE_ANCHOR.x,
    V070_MINE_ANCHOR.y,
    72,
    0,
    Math.PI * 2
  );
  c.fill();

  c.beginPath();
  c.strokeStyle = "#4d4840";
  c.lineWidth = 8;
  c.arc(
    V070_MINE_ANCHOR.x,
    V070_MINE_ANCHOR.y,
    78,
    0,
    Math.PI * 2
  );
  c.stroke();

  // Mãe permanece fisicamente na mina; não existe pai real aqui.
  if (!state.ending?.complete) {
    person(
      V070_MOTHER_POS.x,
      V070_MOTHER_POS.y,
      "mother",
      0,
      state.x < V070_MOTHER_POS.x
        ? "left"
        : "right",
      0.96
    );
  }

  if (
    state.chapter9?.observerSeen &&
    elapsed < v070DeepObserverUntil
  ) {
    const x = 925;
    const y = 325;
    const jitter =
      Math.sin(elapsed * 49) * 2;

    rect(x - 25 + jitter, y - 18, 43, 13, "#010203");
    rect(x - 12 - jitter, y - 33, 28, 19, "#010203");
    rect(x - 31, y - 9, 19, 8, "#010203");
    rect(x + 11, y - 13, 22, 9, "#010203");
    rect(x - 17, y - 5, 8, 17, "#010203");
    rect(x + 8, y - 6, 9, 18, "#010203");
  }

  person(
    state.x,
    state.y,
    "player",
    state.walk,
    state.facing
  );

  c.restore();

  v070DrawDeepDarkness();

  if (elapsed < v070DeepStaticUntil) {
    for (let i = 0; i < 28; i++) {
      const y =
        (i * 15 + Math.floor(elapsed * 830) % H) % H;

      rect(
        0,
        y,
        W,
        1 + (i % 4 === 0 ? 1 : 0),
        "rgba(230,233,225,0.11)"
      );
    }
  }
}

function v070DrawDeepDarkness() {
  const on =
    state.flashlight?.owned &&
    state.flashlight.on &&
    state.flashlight.battery > 0;

  let sx =
    state.x - camera.x;
  let sy =
    state.y - camera.y - 8;

  if (on) {
    if (state.facing === "left") sx -= 50;
    else if (state.facing === "right") sx += 50;
    else if (state.facing === "up") sy -= 55;
    else sy += 55;
  }

  const gradient =
    c.createRadialGradient(
      sx,
      sy,
      on ? 28 : 10,
      sx,
      sy,
      on ? 205 : 55
    );

  if (on) {
    gradient.addColorStop(0, "rgba(0,0,0,0.02)");
    gradient.addColorStop(0.4, "rgba(0,0,0,0.12)");
    gradient.addColorStop(0.72, "rgba(0,0,0,0.67)");
    gradient.addColorStop(1, "rgba(0,0,0,0.98)");
  } else {
    gradient.addColorStop(0, "rgba(0,0,0,0.70)");
    gradient.addColorStop(1, "rgba(0,0,0,0.995)");
  }

  c.save();
  c.fillStyle = gradient;
  c.fillRect(0, 0, W, H);

  txt(
    "LANTERNA " +
    Math.ceil(state.flashlight?.battery || 0) +
    "% · L",
    14,
    H - 14,
    (state.flashlight?.battery || 0) < 20
      ? "#c49a83"
      : "#c9c2ad",
    7
  );

  c.restore();
}

function v070DrawMemoryHouse() {
  const memory =
    state.memoryHouse;

  rect(0, 0, W, H, "#090a0c");

  const phase =
    memory.phase;

  // Cada versão é um cenário completo, sem colisão ou movimento.
  const wall =
    phase === "true"
      ? "#5b5144"
      : phase === "v5" || phase === "v5break"
        ? "#725d43"
        : "#423d37";

  const floor =
    phase === "true"
      ? "#4b4035"
      : "#2f2b28";

  rect(34, 32, W - 68, H - 58, wall);
  rect(48, 94, W - 96, H - 132, floor);

  // Janela.
  rect(72, 49, 78, 38, "#171c20");
  rect(109, 49, 3, 38, "#4c4940");
  rect(72, 67, 78, 3, "#4c4940");

  // Mesa.
  rect(205, 147, 120, 42, "#5b4633");
  rect(218, 189, 8, 34, "#3c3027");
  rect(304, 189, 8, 34, "#3c3027");

  // Relógio.
  rect(359, 56, 54, 38, "#242424");
  txt(
    phase === "true"
      ? "00:17"
      : "07:00",
    369,
    79,
    "#b5ad99",
    8
  );

  if (phase === "v1") {
    // Cadeira propositalmente no lado errado.
    rect(168, 155, 28, 34, "#554334");
  } else {
    rect(331, 155, 28, 34, "#554334");
  }

  if (phase === "v2") {
    txt(
      "UMA LEMBRANÇA CONTADA POR OUTRA VOZ",
      84,
      238,
      "#8e897f",
      7
    );
  }

  if (phase === "v3") {
    // A mesa dos pais fica vazia.
    rect(48, 94, 110, 85, "#2a2725");
    txt(
      "NADA FOI ENCONTRADO",
      63,
      141,
      "#777067",
      7
    );
  }

  if (phase === "v4") {
    // Quarto do irmão apagado.
    rect(48, 94, W - 96, H - 132, "#242526");
    rect(95, 125, 285, 88, "#292a2b");
    txt(
      "UM CÔMODO SEM HISTÓRIA",
      151,
      173,
      "#716d66",
      8
    );
  }

  if (
    phase === "v5" ||
    phase === "v5break"
  ) {
    person(
      276,
      168,
      "father",
      0,
      "down",
      1.08
    );

    // Tatuagem fica visível como detalhe físico, não como "monstro".
    rect(
      286,
      153,
      8,
      3,
      "#222126"
    );
  }

  if (phase === "true") {
    person(
      140,
      190,
      "brother",
      0,
      "right",
      0.82
    );

    person(
      370,
      192,
      "mother",
      0,
      "left",
      0.96
    );
  }

  if (elapsed < v070MemoryStaticUntil) {
    for (let i = 0; i < 34; i++) {
      const y =
        (i * 11 + Math.floor(elapsed * 930) % H) % H;

      rect(
        (i % 2 ? -8 : 4),
        y,
        W + 16,
        1 + (i % 5 === 0 ? 2 : 0),
        "rgba(232,234,228,0.14)"
      );
    }
  }
}

const v070FinalDrawBase = drawWorld;
drawWorld = function() {
  if (
    state?.memoryHouse?.active
  ) {
    v070DrawMemoryHouse();
    return;
  }

  if (
    state?.room === "undergroundPassage"
  ) {
    v070DrawTunnelWorld();
    return;
  }

  if (
    state?.room === "mineDeep"
  ) {
    v070DrawMineWorld();
    return;
  }

  v070FinalDrawBase();
};

const v070FinalUpdateBase = update;
update = function(dt) {
  prepareSystems();

  if (
    state?.memoryHouse?.active
  ) {
    elapsed += dt;
    return;
  }

  const finalExploration =
    state &&
    ["undergroundPassage", "mineDeep"].includes(state.room);

  let savedClock = null;

  if (finalExploration) {
    savedClock = {
      day: state.day,
      minutes: state.minutes,
      firstExit: state.firstExit,
      dawnCollapseArmed: state.dawnCollapseArmed
    };

    // Movimento continua pelo pipeline normal, mas o clímax não pode
    // ser interrompido por 07:00, fome ou evento de rua.
    state.day = 0;
    state.minutes = 0;
    state.firstExit = false;
    state.dawnCollapseArmed = false;
  }

  v070FinalUpdateBase(dt);

  if (savedClock && state) {
    state.day = savedClock.day;
    state.minutes = savedClock.minutes;
    state.firstExit = savedClock.firstExit;
    state.dawnCollapseArmed = savedClock.dawnCollapseArmed;

    if (state.dawnCollapse) {
      state.dawnCollapse.active = false;
      state.dawnCollapse.phase = "idle";
      state.dawnCollapse.time = 0;
    }

    updateHud();
  }

  if (
    !state ||
    mode !== "game" ||
    dialog ||
    transitionBusy ||
    !$("overlay").hidden ||
    state.gameOver ||
    state.dawnCollapse?.active ||
    state.wakeUp?.active
  ) {
    return;
  }

  if (
    ["undergroundPassage", "mineDeep"].includes(state.room) &&
    state.flashlight?.owned &&
    state.flashlight.on &&
    state.flashlight.battery > 0
  ) {
    state.flashlight.battery = Math.max(
      0,
      state.flashlight.battery - dt * 0.11
    );

    if (
      state.flashlight.battery <= 0 &&
      !state.flashlight.emptyWarned
    ) {
      state.flashlight.on = false;
      state.flashlight.emptyWarned = true;

      v06Toast(
        "A lanterna apagou. Preciso voltar.",
        2.4
      );

      save();
    }
  }

  if (
    state.room === "undergroundPassage" &&
    !state.chapter9.tunnelSeen &&
    state.x > 1180
  ) {
    state.chapter9.tunnelSeen = true;
    v070DeepStaticUntil = elapsed + 0.45;

    v06Toast(
      "A alvenaria da casa terminou. Isso é parte da mina.",
      2.5
    );

    save();
  }
};

const v070FinalHudBase = updateHud;
updateHud = function() {
  v070FinalHudBase();

  if (!state || state.stage === "prologue") return;

  prepareSystems();

  if (
    state.ending?.complete
  ) {
    $("objective").textContent =
      state.ending.id === "good"
        ? "FIM · A Casa que Restou"
        : state.ending.id === "whoRemained"
          ? "FIM · Quem Restou"
          : "FIM · O Que Ficou Para Trás";
    return;
  }

  if (
    v070Chapter9Unlocked() &&
    !state.chapter9.complete
  ) {
    if (!state.chapter9.brotherPrepared) {
      $("objective").textContent =
        "Converse com seu irmão antes de descer.";
      return;
    }

    if (!state.chapter9.entered) {
      $("objective").textContent =
        "Volte ao porão com a lanterna e entre pela abertura atrás do armário.";
      return;
    }

    if (state.room === "undergroundPassage") {
      $("objective").textContent =
        "Siga a passagem até a antiga mina.";
      return;
    }

    if (
      state.room === "mineDeep" &&
      !state.chapter9.motherMet
    ) {
      $("objective").textContent =
        "Encontre quem está na galeria.";
      return;
    }

    if (
      state.room === "mineDeep" &&
      state.chapter9.motherMet &&
      !state.chapter9.memoryStarted
    ) {
      $("objective").textContent =
        "Aproxime-se do poço.";
      return;
    }
  }
};

// Durante a Casa da Memória, Esc não pode fechar a decisão e devolver
// movimento livre. A sequência só avança pelas escolhas narrativas.
window.addEventListener(
  "keydown",
  event => {
    if (
      state?.memoryHouse?.active &&
      event.key.toLowerCase() === "escape"
    ) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  },
  true
);

$("help").onclick = () => modal(
  "Como jogar",
  "WASD / setas: andar. Shift/F: correr. E: interagir. I: inventário. C: celular. L: ligar/desligar a lanterna. Esc: pausar. ESPAÇO: soco apenas contra ameaças físicas compatíveis.\n\nAs contradições importantes ficam registradas sem mostrar pontuação de final. Cuidar do seu irmão, conferir pistas físicas e não aceitar memórias fáceis altera o que Estevão consegue defender no clímax.\n\nA partir da descida para a mina, o relógio para: o confronto final não é interrompido pelas 07:00.",
  [["Voltar", closeModal]]
);


// =========================================================
// 0.7.1 — PRAÇA CENTRAL INTEGRADA À PROGRESSÃO
// =========================================================

// A praça já existia como mapa. Esta camada torna o acesso, a missão
// e os moradores legíveis para o jogador sem alterar capítulos posteriores.
const V071_SQUARE_VENDOR = {
  x: 220,
  y: 488
};

const V071_SQUARE_CARD_A = {
  x: 420,
  y: 555
};

const V071_SQUARE_CARD_B = {
  x: 462,
  y: 555
};

function v071DrawSquareAmbientWorld() {
  if (
    !state ||
    state.room !== "square" ||
    state.stage === "prologue"
  ) {
    return;
  }

  // Carrinho de picolé sendo fechado. Ele funciona como orientação
  // diegética para o cadeirante na primeira visita.
  if (state.day <= 7) {
    rect(
      V071_SQUARE_VENDOR.x - 26,
      V071_SQUARE_VENDOR.y + 9,
      48,
      24,
      "#6a6255"
    );
    rect(
      V071_SQUARE_VENDOR.x - 21,
      V071_SQUARE_VENDOR.y + 4,
      38,
      7,
      "#b8aa88"
    );
    rect(
      V071_SQUARE_VENDOR.x - 20,
      V071_SQUARE_VENDOR.y + 32,
      7,
      7,
      "#232628"
    );
    rect(
      V071_SQUARE_VENDOR.x + 12,
      V071_SQUARE_VENDOR.y + 32,
      7,
      7,
      "#232628"
    );

    person(
      V071_SQUARE_VENDOR.x,
      V071_SQUARE_VENDOR.y,
      "npcMale",
      0,
      "left",
      0.9
    );

    txt(
      "VENDEDOR",
      V071_SQUARE_VENDOR.x - 28,
      V071_SQUARE_VENDOR.y - 36,
      "#b9b29e",
      7
    );
  }

  // Dois aposentados mantêm a praça com aparência de lugar vivido.
  person(
    V071_SQUARE_CARD_A.x,
    V071_SQUARE_CARD_A.y,
    "npcMale",
    0,
    "right",
    0.86
  );

  person(
    V071_SQUARE_CARD_B.x,
    V071_SQUARE_CARD_B.y,
    "npcMale",
    0,
    "left",
    0.86
  );

  rect(
    434,
    557,
    16,
    10,
    "#4b3f34"
  );

  // O morador do Capítulo 5 aparece desde cedo. Assim, quando sua
  // lembrança muda mais tarde, o jogador já o conhece.
  if (!v0650Chapter5Unlocked()) {
    person(
      V0650_SQUARE_RESIDENT.x,
      V0650_SQUARE_RESIDENT.y,
      "npcMale",
      0,
      "left",
      0.9
    );

    txt(
      "MORADOR",
      V0650_SQUARE_RESIDENT.x - 25,
      V0650_SQUARE_RESIDENT.y - 34,
      "#aca798",
      7
    );
  }
}

const v071GetNearBase = getNear;
getNear = function() {
  prepareSystems();

  if (
    state?.room === "square" &&
    state.stage !== "prologue"
  ) {
    if (
      state.day <= 7 &&
      Math.hypot(
        state.x - V071_SQUARE_VENDOR.x,
        state.y - V071_SQUARE_VENDOR.y
      ) < 44
    ) {
      return {
        label: "Falar com o vendedor",
        action: "squareVendor"
      };
    }

    if (
      !v0650Chapter5Unlocked() &&
      Math.hypot(
        state.x - V0650_SQUARE_RESIDENT.x,
        state.y - V0650_SQUARE_RESIDENT.y
      ) < 42
    ) {
      return {
        label: "Falar com o morador",
        action: "squareEarlyResident"
      };
    }

    const cardsDistance = Math.min(
      Math.hypot(
        state.x - V071_SQUARE_CARD_A.x,
        state.y - V071_SQUARE_CARD_A.y
      ),
      Math.hypot(
        state.x - V071_SQUARE_CARD_B.x,
        state.y - V071_SQUARE_CARD_B.y
      )
    );

    if (cardsDistance < 44) {
      return {
        label: "Falar com os aposentados",
        action: "squareCards"
      };
    }
  }

  return v071GetNearBase();
};

const v071InteractBase = interact;
interact = function(action) {
  prepareSystems();

  if (action === "squareVendor") {
    const first =
      !state.storyFlags.squareVendorTalked;

    if (first) {
      state.storyFlags.squareVendorTalked = true;

      say(
        [
          ["Você", "O senhor viu meus pais passarem por aqui? Os Lancaster."],
          ["Vendedor", "Hoje não. Mas eu fecho tarde e não fico olhando a rua o tempo todo."],
          ["Vendedor", "Se alguém reparou, foi o homem de cadeira ali do outro lado."],
          ["Vendedor", "Ele fica horas olhando quem entra e quem sai da praça."],
          ["Você", "Ele conhece meus pais?"],
          ["Vendedor", "Não sei se conhece. Só sei que ele repara em coisa que ninguém mais repara."]
        ],
        () => {
          updateHud();
          save();
        }
      );
    } else {
      say([
        ["Vendedor", "O homem da cadeira ainda está ali."],
        ["Vendedor", "Se veio perguntar de novo, eu realmente não vi seus pais."]
      ]);
    }

    return;
  }

  if (action === "squareEarlyResident") {
    const first =
      !state.storyFlags.squareEarlyResidentTalked;

    state.storyFlags.squareEarlyResidentTalked = true;

    say(
      first
        ? [
            ["Morador", "Os Lancaster? Não vi os dois hoje."],
            ["Morador", "Eu fico mais olhando a fonte do que a rua."],
            ["Você", "Você vem sempre aqui?"],
            ["Morador", "Há anos. Meus filhos eram pequenos e essa fonte já vivia entupindo."]
          ]
        : [
            ["Morador", "Seus pais não passaram por mim."],
            ["Morador", "Mas essa praça engole tanta conversa que eu já nem sei quem eu vi ontem."]
          ],
      save
    );

    return;
  }

  if (action === "squareCards") {
    const first =
      !state.storyFlags.squareCardsTalked;

    state.storyFlags.squareCardsTalked = true;

    say(
      first
        ? [
            ["Aposentado", "Lancaster? Não vi. Pergunta pro homem da cadeira."],
            ["Outro aposentado", "Você não viu nem a carta que eu joguei."],
            ["Aposentado", "Eu vi. Só não gostei dela."],
            ["Você", "...Tá."]
          ]
        : [
            ["Aposentado", "Ainda procurando?"],
            ["Você", "Ainda."],
            ["Outro aposentado", "Então não perde tempo com a nossa mesa."]
          ],
      save
    );

    return;
  }

  v071InteractBase(action);
};

// Sinal visível no bairro: o jogador entende que existe uma rota leste
// mesmo enquanto ela ainda está bloqueada narrativamente.
const v071DrawWorldBase = drawWorld;
drawWorld = function() {
  v071DrawWorldBase();

  if (
    !state ||
    state.room !== "village" ||
    state.stage === "prologue"
  ) {
    return;
  }

  c.save();
  c.translate(
    -Math.floor(camera.x),
    -Math.floor(camera.y)
  );

  const signX =
    maps.village.w - 118;
  const signY = 372;

  rect(
    signX,
    signY,
    86,
    24,
    "#4b4438"
  );
  rect(
    signX + 4,
    signY + 4,
    78,
    16,
    "#6b604d"
  );
  txt(
    "PRAÇA →",
    signX + 15,
    signY + 16,
    "#d2c7a9",
    8
  );
  rect(
    signX + 39,
    signY + 24,
    7,
    27,
    "#41392f"
  );

  c.restore();
};


// =========================================================
// 0.7.2 — PRIMEIRA NOITE / DIA 1
// INVESTIGAÇÃO PRIMEIRO, FOME QUANDO FIZER SENTIDO
// =========================================================

function v072EnsureDay1State() {
  if (!state) return;

  if (!state.day1Progress || typeof state.day1Progress !== "object") {
    state.day1Progress = {
      neighborVisited: false,
      policeVisited: false,
      vanSeen: false,
      completed: false
    };
  }

  for (const key of [
    "neighborVisited",
    "policeVisited",
    "vanSeen",
    "completed"
  ]) {
    if (typeof state.day1Progress[key] !== "boolean") {
      state.day1Progress[key] = false;
    }
  }

  // Migração do fluxo antigo: os estágios supplies/return eram uma
  // missão obrigatória de comida. Agora a primeira noite é investigação.
  if (
    state.day === 1 &&
    ["supplies", "return"].includes(state.stage)
  ) {
    state.stage = "free";
  }
}

const v072PrepareBase = prepareSystems;
prepareSystems = function() {
  v072PrepareBase();
  v072EnsureDay1State();
};

function v072Day1CluesDone() {
  const q = chapter();

  return Boolean(
    q &&
    Array.isArray(q.clues) &&
    q.clues.length >= 3
  );
}

function v072TryCompleteDay1() {
  prepareSystems();

  if (
    state.day !== 1 ||
    state.day1Progress.completed
  ) {
    return false;
  }

  if (
    !v072Day1CluesDone() ||
    !state.day1Progress.neighborVisited ||
    !state.day1Progress.policeVisited
  ) {
    return false;
  }

  state.day1Progress.completed = true;
  state.finished = true;
  state.stage = "free";

  v06Toast(
    "Você fez o que podia na rua por enquanto. Volte para casa e veja como seu irmão está.",
    2.8
  );

  updateHud();
  save();

  return true;
}

function v072FlorindaStoryPending() {
  if (!state) return false;

  if (
    state.day === 1 &&
    !state.day1Progress?.neighborVisited
  ) {
    return true;
  }

  if (
    state.storyFlags?.florindaChapter4Concern &&
    !state.storyFlags?.florindaChapter4ConcernSeen
  ) {
    return true;
  }

  if (
    state.chapter8 &&
    state.chapter7?.complete &&
    state.day >= 17 &&
    !state.chapter8.florindaConfronted
  ) {
    return true;
  }

  return false;
}

function v072NeighborDoorAvailable() {
  prepareSystems();

  return Boolean(
    state.stage === "prologue" ||
    v072FlorindaStoryPending() ||
    (
      state.brotherFood < 60 &&
      state.food <= 0
    )
  );
}

function v072FirstNeighborVisit() {
  say(
    [
      ["Florinda", "Estevão? O que você está fazendo fora a essa hora?"],
      ["Você", "Meus pais ainda não voltaram do mercado."],
      ["Florinda", "Ainda não? Você já tentou ligar ou mandar mensagem pra eles?"],
      ["Você", "Já. No da minha mãe aparece sem sinal. O do meu pai diz fora de área."],
      ["Florinda", "Sem sinal até dentro de casa? Estranho. Aqui a rede costuma funcionar."],
      ["Você", "Eu queria saber se a senhora viu eles voltando."],
      ["Florinda", "Não vi."],
      ["Florinda", "Se eles continuarem desaparecidos, fala com o Anísio na delegacia. E não deixa seu irmão sozinho por muito tempo."],
      ["Você", "Ele acabou de comer. Está bem por enquanto."],
      ["Florinda", "Então não leva comida sem precisar. Se faltar mais tarde, bate aqui."]
    ],
    () => {
      state.day1Progress.neighborVisited = true;
      updateHud();
      save();
      v072TryCompleteDay1();
    }
  );
}

const v072PoliceParentsBase = v0630PoliceParents;
v0630PoliceParents = function() {
  prepareSystems();

  if (
    state.day === 1 &&
    !state.day1Progress.policeVisited
  ) {
    state.day1Progress.policeVisited = true;
    save();
  }

  v072PoliceParentsBase();

  // O diálogo é linear; registrar a visita aqui não antecipa nenhuma
  // recompensa nem libera capítulos fora de ordem.
  v072TryCompleteDay1();
};

const v072ScheduleOutingBase = v0645ScheduleOutingEvent;
v0645ScheduleOutingEvent = function() {
  prepareSystems();

  // A Bíblia pede que a primeira noite plante apenas desconforto.
  // A primeira saída do Dia 1 força a van à distância, sem invasão.
  if (
    state.day === 1 &&
    !state.day1Progress.vanSeen
  ) {
    state.randomEventState.pending = true;
    state.randomEventState.timer =
      5 + Math.random() * 3;
    state.randomEventState.type = "van";

    save();
    return;
  }

  v072ScheduleOutingBase();
};

const v072TriggerRandomBase = v0645TriggerRandomEvent;
v0645TriggerRandomEvent = function() {
  const type =
    state?.randomEventState?.type;

  v072TriggerRandomBase();

  if (
    state &&
    state.day === 1 &&
    type === "van"
  ) {
    prepareSystems();
    state.day1Progress.vanSeen = true;
    save();
  }
};

const v072InteractBase = interact;
interact = function(action) {
  prepareSystems();

  if (action === "neighborDoor") {
    if (state.stage === "prologue") {
      v072InteractBase(action);
      return;
    }

    if (!v072NeighborDoorAvailable()) {
      say([
        state.brotherFood >= 60
          ? "Não preciso incomodar Florinda agora. Meu irmão ainda está bem alimentado."
          : "Já estou levando uma porção. Primeiro preciso voltar para casa."
      ]);
      return;
    }

    v072InteractBase(action);
    return;
  }

  if (
    action === "vendor" &&
    state.day === 1 &&
    !state.day1Progress.neighborVisited
  ) {
    v072FirstNeighborVisit();
    return;
  }

  v072InteractBase(action);
};

const v072UpdateBase = update;
update = function(dt) {
  prepareSystems();

  v072UpdateBase(dt);

  if (!state) return;

  if (
    state.day === 1 &&
    !state.day1Progress.completed
  ) {
    v072TryCompleteDay1();
  }
};

const v072HudBase = updateHud;
updateHud = function() {
  v072HudBase();

  if (
    !state ||
    state.stage === "prologue" ||
    state.day !== 1
  ) {
    return;
  }

  prepareSystems();

  const q = chapter();
  const clueCount =
    Array.isArray(q?.clues)
      ? q.clues.length
      : 0;

  if (clueCount < 3) {
    $("objective").textContent =
      "Investigue o quarto dos seus pais · pistas " +
      clueCount +
      "/3.";
    return;
  }

  if (
    !state.day1Progress.neighborVisited &&
    !state.day1Progress.policeVisited
  ) {
    $("objective").textContent =
      "Converse com Florinda e registre o desaparecimento na delegacia.";
    return;
  }

  if (!state.day1Progress.neighborVisited) {
    $("objective").textContent =
      "Fale com Florinda na casa vizinha.";
    return;
  }

  if (!state.day1Progress.policeVisited) {
    $("objective").textContent =
      "Registre o desaparecimento na delegacia.";
    return;
  }

  $("objective").textContent =
    "Continue explorando o bairro até o amanhecer.";
};

// =========================================================
// 0.7.5 — FLUXO DA PRIMEIRA NOITE + PAIS SEM SOBREPOSIÇÃO
// =========================================================

function v075EnsureFirstNightSequence() {
  if (
    !state ||
    state.stage === "prologue" ||
    state.day !== 1 ||
    state.firstExit
  ) {
    return;
  }

  const q = chapter();
  const clueCount =
    Array.isArray(q?.clues)
      ? q.clues.length
      : 0;

  if (clueCount < 3) {
    return;
  }

  // Depois das três pistas, a sequência obrigatória é:
  // irmão -> chave -> sair de casa -> Florinda -> delegacia.
  if (state.key) {
    if (state.stage !== "exit") {
      state.stage = "exit";
    }
    return;
  }

  if (state.stage !== "key") {
    state.stage = "talk";
  }
}

const v075HudBase = updateHud;
updateHud = function() {
  v075EnsureFirstNightSequence();
  v075HudBase();

  if (!state) return;

  if (
    state.firstExit &&
    state.day === 1 &&
    state.minutes < 420 &&
    !state.forcedSleepDue
  ) {
    $("timeNote").textContent =
      "PRIMEIRA NOITE · 1 HORA = 00:30";
  }

  if (
    state.stage === "prologue" ||
    state.day !== 1
  ) {
    return;
  }

  const q = chapter();
  const clueCount =
    Array.isArray(q?.clues)
      ? q.clues.length
      : 0;

  if (clueCount < 3) {
    $("objective").textContent =
      "Investigue o quarto dos seus pais · pistas " +
      clueCount +
      "/3.";
    return;
  }

  if (!state.firstExit) {
    if (!state.key) {
      $("objective").textContent =
        state.stage === "key"
          ? "Pegue a chave reserva atrás do relógio parado da sala."
          : "Fale com seu irmão.";
    } else {
      $("objective").textContent =
        "Use a chave reserva e saia de casa.";
    }
    return;
  }

  if (
    !state.day1Progress.neighborVisited &&
    !state.day1Progress.policeVisited
  ) {
    $("objective").textContent =
      "Fale com Florinda na casa vizinha.";
    return;
  }

  if (!state.day1Progress.neighborVisited) {
    $("objective").textContent =
      "Fale com Florinda na casa vizinha.";
    return;
  }

  if (!state.day1Progress.policeVisited) {
    $("objective").textContent =
      "Registre o desaparecimento na delegacia.";
    return;
  }

  $("objective").textContent =
    "Continue explorando o bairro até o amanhecer.";
};

// Ajuda atualizada: a primeira noite é mais curta e não pula etapas.
$("help").onclick = () => modal(
  "Como jogar",
  "WASD / setas: andar. Shift/F: correr. E: interagir. I: inventário. C: celular. L: ligar/desligar a lanterna. Esc: pausar. ESPAÇO: soco apenas contra ameaças físicas compatíveis.\n\nNa primeira noite, cada hora do jogo leva 30 segundos reais. Depois das três pistas, fale com seu irmão, pegue a chave reserva, saia de casa, converse com Florinda e registre o desaparecimento na delegacia. A primeira saída ainda pode mostrar a van à distância.\n\nNas noites seguintes, o ritmo volta para 1 hora do jogo por 1 minuto real. Às 07:00, Estevão perde os sentidos.",
  [["Voltar", closeModal]]
);

// =========================================================
// 0.7.6 — RUAS DE ACESSO AO MERCADO E À PRAÇA
// =========================================================

// O mercado e a praça deixam de ser teletransportes diretos.
// Agora cada destino possui uma rua própria antes da área principal.
if (!maps.northRoad) {
  maps.northRoad = {
    w: 900,
    h: 1320,
    objects: [
      // Mercado no fim da rua.
      obj(270, 70, 360, 165, "market"),

      // Residências ao longo da rua.
      obj(55, 345, 225, 165, "building"),
      obj(620, 350, 220, 165, "building"),
      obj(65, 650, 215, 165, "building"),
      obj(620, 665, 220, 165, "building"),
      obj(55, 955, 225, 165, "building"),
      obj(620, 960, 220, 165, "building")
    ],
    doors: [
      door(
        450, 260,
        null, 0, 0,
        "Entrar no mercado",
        "northMarketDoor"
      )
    ]
  };
}
roomNames.northRoad = "Rua do mercado · norte de Forgotten";

if (!maps.squareRoad) {
  maps.squareRoad = {
    w: 1400,
    h: 760,
    objects: [
      // Casas nas duas laterais da rua sem saída.
      obj(150, 70, 235, 165, "building"),
      obj(500, 72, 225, 165, "building"),
      obj(835, 68, 235, 170, "building"),

      obj(190, 515, 235, 165, "building"),
      obj(545, 520, 225, 160, "building"),
      obj(885, 510, 235, 170, "building")
    ],
    doors: [
      door(
        1245, 365,
        null, 0, 0,
        "Entrar na praça central",
        "squareRoadEntrance"
      )
    ]
  };
}
roomNames.squareRoad = "Rua da praça · leste de Forgotten";

function v076SetOutdoorRoom(room, x, y, facing) {
  state.room = room;
  state.x = x;
  state.y = y;
  state.facing = facing;
  state.walk = 0;
  keys.clear();
  near = null;
  updateHud();
  save();
}

function v076DrawRoadTexture(x, y, w, h, horizontal = false) {
  rect(x, y, w, h, "#69665d");

  // Sombra nas bordas dá espessura ao asfalto.
  if (horizontal) {
    rect(x, y, w, 5, "#4f514c55");
    rect(x, y + h - 5, w, 5, "#3f444155");
  } else {
    rect(x, y, 5, h, "#4f514c55");
    rect(x + w - 5, y, 5, h, "#3f444155");
  }

  // Desgaste determinístico: rachaduras e remendos leves.
  const count = horizontal
    ? Math.max(4, Math.floor(w / 150))
    : Math.max(4, Math.floor(h / 150));

  for (let i = 0; i < count; i++) {
    const a = hash(i + x, y + h);
    const b = hash(i + y, x + w);

    if (horizontal) {
      const px = x + 35 + a * Math.max(1, w - 70);
      const py = y + 16 + b * Math.max(1, h - 32);
      rect(px, py, 19, 2, "#4c4c4745");
      rect(px + 7, py + 2, 2, 8, "#4c4c4738");
    } else {
      const px = x + 16 + a * Math.max(1, w - 32);
      const py = y + 35 + b * Math.max(1, h - 70);
      rect(px, py, 2, 20, "#4c4c4745");
      rect(px + 2, py + 8, 8, 2, "#4c4c4738");
    }
  }

  if (horizontal) {
    for (let px = x + 28; px < x + w - 20; px += 58) {
      rect(px, y + h / 2 - 2, 25, 4, "#b9ad87");
    }
  } else {
    for (let py = y + 28; py < y + h - 20; py += 58) {
      rect(x + w / 2 - 2, py, 4, 25, "#b9ad87");
    }
  }
}

function v076DrawNorthRoad() {
  const m = maps.northRoad;

  camera.x = Math.max(
    0,
    Math.min(m.w - W, state.x - W / 2)
  );
  camera.y = Math.max(
    0,
    Math.min(m.h - H, state.y - H / 2)
  );

  c.save();
  c.translate(
    -Math.floor(camera.x),
    -Math.floor(camera.y)
  );

  rect(0, 0, m.w, m.h, "#34493c");

  // Rua principal, calçadas e marcação central.
  v076DrawRoadTexture(350, 0, 200, m.h, false);
  rect(330, 0, 20, m.h, "#8a867b");
  rect(550, 0, 20, m.h, "#8a867b");

  // Pequenas entradas para as casas.
  for (const y of [430, 735, 1040]) {
    rect(280, y, 70, 38, "#777268");
    rect(550, y + 10, 70, 38, "#777268");
  }

  // Postes alternados deixam a rua mais longa e legível.
  for (let y = 310; y < 1220; y += 210) {
    const left = Math.floor(y / 210) % 2 === 0;
    const x = left ? 312 : 575;

    rect(x, y, 4, 36, "#343a39");
    rect(x - 4, y - 3, 12, 5, "#4d5350");
    rect(x - 2, y - 1, 8, 3, "#d2b777");
  }

  for (const o of m.objects) {
    building(o);
  }

  txt(
    "MERCADO",
    405,
    250,
    "#d4c49c",
    8
  );

  person(
    state.x,
    state.y,
    "player",
    state.walk,
    state.facing
  );

  c.restore();
  v0646ApplyOutdoorLight();
}

function v076DrawSquareRoad() {
  const m = maps.squareRoad;

  camera.x = Math.max(
    0,
    Math.min(m.w - W, state.x - W / 2)
  );
  camera.y = Math.max(
    0,
    Math.min(m.h - H, state.y - H / 2)
  );

  c.save();
  c.translate(
    -Math.floor(camera.x),
    -Math.floor(camera.y)
  );

  rect(0, 0, m.w, m.h, "#354a3d");

  // Rua leste: termina em um retorno circular antes da praça.
  v076DrawRoadTexture(0, 310, 1125, 115, true);
  rect(0, 290, 1120, 20, "#8a867b");
  rect(0, 425, 1120, 20, "#8a867b");

  c.fillStyle = "#706b5f";
  c.beginPath();
  c.arc(1135, 367, 118, 0, Math.PI * 2);
  c.fill();

  c.strokeStyle = "#8a867b";
  c.lineWidth = 18;
  c.beginPath();
  c.arc(1135, 367, 126, -Math.PI * 0.58, Math.PI * 0.58);
  c.stroke();

  // Caminho de pedestres da rua sem saída até a praça.
  rect(1210, 337, 190, 60, "#7b786f");
  for (let x = 1220; x < 1390; x += 28) {
    rect(x, 347, 18, 10, "#8d897f");
    rect(x + 8, 370, 18, 10, "#817e75");
  }

  // Casas residenciais.
  for (const o of m.objects) {
    building(o);
  }

  // Postes acompanham os pontos de luz do passe visual global.
  for (const [lx, ly] of [
    [240, 285],
    [610, 285],
    [960, 285],
    [240, 455],
    [610, 455],
    [960, 455]
  ]) {
    rect(lx, ly, 4, 34, "#343a39");
    rect(lx - 4, ly - 3, 12, 5, "#4d5350");
    rect(lx - 2, ly - 1, 8, 3, "#d2b777");
  }

  // Árvores no fundo da rua reforçam que o asfalto não continua.
  for (const [x, y] of [
    [1090, 180],
    [1180, 190],
    [1095, 555],
    [1190, 545]
  ]) {
    rect(x, y, 8, 32, "#493f31");
    rect(x - 17, y - 19, 42, 30, "#244438");
    rect(x - 10, y - 30, 29, 26, "#315441");
  }

  txt(
    "PRAÇA →",
    1210,
    320,
    "#d4c49c",
    8
  );

  person(
    state.x,
    state.y,
    "player",
    state.walk,
    state.facing
  );

  c.restore();
  v0646ApplyOutdoorLight();
}

const v076DrawWorldBase = drawWorld;
drawWorld = function() {
  if (state?.room === "northRoad") {
    v076DrawNorthRoad();
    return;
  }

  if (state?.room === "squareRoad") {
    v076DrawSquareRoad();
    return;
  }

  v076DrawWorldBase();
};

// Do bairro para o norte, o jogador agora chega primeiro à rua do mercado.
v0648GoMarket = function() {
  if (
    !state ||
    transitionBusy ||
    dialog ||
    !v0648Chapter2Unlocked()
  ) {
    return;
  }

  fade(
    "Rua do mercado",
    "Norte de Forgotten",
    () => {
      v076SetOutdoorRoom(
        "northRoad",
        450,
        maps.northRoad.h - 70,
        "up"
      );
    }
  );
};

// Do bairro para leste, a praça passa a ficar no fim de uma rua sem saída.
v0648GoSquare = function() {
  if (
    !state ||
    transitionBusy ||
    dialog ||
    !v0648Chapter2Unlocked() ||
    !state.storyFlags?.marketParentsConfirmed
  ) {
    return;
  }

  fade(
    "Rua da praça",
    "Leste de Forgotten",
    () => {
      v076SetOutdoorRoom(
        "squareRoad",
        70,
        367,
        "right"
      );
    }
  );
};

// Ao sair da praça, volta para a rua, não diretamente para o bairro.
v0648ReturnFromSquare = function() {
  if (!state || transitionBusy || dialog) return;

  fade(
    "",
    "",
    () => {
      v076SetOutdoorRoom(
        "squareRoad",
        1190,
        367,
        "left"
      );
    }
  );
};

// A porta interna do mercado também retorna para a rua norte.
const v076MarketExit =
  maps.market?.doors?.find(d => d.label === "Sair do mercado");

if (v076MarketExit) {
  v076MarketExit.to = null;
  v076MarketExit.action = "leaveMarketToNorthRoad";
  v076MarketExit.label = "Sair para a rua do mercado";
}

const v076InteractBase = interact;
interact = function(action) {
  if (action === "northMarketDoor") {
    fade(
      "Mercado",
      "Fim da rua norte",
      () => {
        go("market", 310, 330);
      }
    );
    return;
  }

  if (action === "leaveMarketToNorthRoad") {
    fade(
      "",
      "",
      () => {
        v076SetOutdoorRoom(
          "northRoad",
          450,
          285,
          "down"
        );
      }
    );
    return;
  }

  if (action === "squareRoadEntrance") {
    fade(
      "Praça central",
      "Fim da rua leste",
      () => {
        const firstVisit =
          !state.storyFlags.squareVisited;

        state.storyFlags.squareVisited = true;
        state.storyFlags.squareVisitCount =
          (state.storyFlags.squareVisitCount || 0) + 1;

        v076SetOutdoorRoom(
          "square",
          82,
          500,
          "right"
        );

        if (firstVisit) {
          v06Toast(
            "Praça central · procure alguém que possa ter visto seus pais.",
            2.6
          );
        }
      }
    );
    return;
  }

  v076InteractBase(action);
};

const v076UpdateBase = update;
update = function(dt) {
  v076UpdateBase(dt);

  if (
    !state ||
    mode !== "game" ||
    dialog ||
    transitionBusy ||
    !$("overlay").hidden
  ) {
    return;
  }

  const down =
    keys.has("s") ||
    keys.has("arrowdown");

  const left =
    keys.has("a") ||
    keys.has("arrowleft");

  if (
    state.room === "northRoad" &&
    state.y >= maps.northRoad.h - 42 &&
    down
  ) {
    state.y = maps.northRoad.h - 44;

    fade(
      "",
      "",
      () => {
        v076SetOutdoorRoom(
          "village",
          650,
          82,
          "down"
        );
      }
    );

    return;
  }

  if (
    state.room === "squareRoad" &&
    state.x <= 42 &&
    left
  ) {
    state.x = 44;

    fade(
      "",
      "",
      () => {
        v076SetOutdoorRoom(
          "village",
          maps.village.w - 58,
          424,
          "left"
        );
      }
    );
  }
};

// Atualiza a leitura da missão enquanto o jogador percorre as novas ruas.
const v076HudBase = updateHud;
updateHud = function() {
  v076HudBase();

  if (!state || state.stage === "prologue") return;

  if (
    state.room === "northRoad" &&
    !state.storyFlags?.marketParentsConfirmed
  ) {
    $("objective").textContent =
      "Siga a rua até o mercado.";
    return;
  }

  if (
    state.room === "squareRoad" &&
    state.storyFlags?.marketParentsConfirmed &&
    !state.squareManFirstSpeechDone
  ) {
    $("objective").textContent =
      "Siga a rua sem saída até a praça central.";
  }
};

// =========================================================
// 0.7.7 — PROGRESSÃO DO OBSERVADOR + DIRETOR DE EVENTOS
// =========================================================

let v077ObserverUntil = 0;
let v077ObserverStaticUntil = 0;
let v077ThreatStaticUntil = 0;

function v077EnsureSystems() {
  if (!state) return;

  if (!state.storyFlags || typeof state.storyFlags !== "object") {
    state.storyFlags = {};
  }

  for (const [key, fallback] of [
    ["squareObserverArmed", false],
    ["squareObserverSeen", false],
    ["squareObserverReported", false]
  ]) {
    if (typeof state.storyFlags[key] !== "boolean") {
      state.storyFlags[key] = fallback;
    }
  }

  // Migração: quem já avançou para Raimundo/mina não volta para trás.
  if (
    state.storyFlags.raimundoMet ||
    state.storyFlags.mineExteriorSeen ||
    state.storyFlags.observerFirstSeen
  ) {
    state.storyFlags.squareObserverSeen = true;
    state.storyFlags.squareObserverReported = true;
    state.storyFlags.squareObserverArmed = false;
  } else if (
    state.squareManFirstSpeechDone &&
    !state.storyFlags.squareObserverSeen
  ) {
    state.storyFlags.squareObserverArmed = true;
  }

  // O primeiro avistamento agora acontece na saída da praça.
  // Impede o gatilho antigo da estrada sul de duplicar a mesma revelação.
  if (state.storyFlags.squareObserverSeen) {
    state.storyFlags.observerFirstSeen = true;
    state.storyFlags.southObserverPending = false;
  }

  if (!state.eventDirector || typeof state.eventDirector !== "object") {
    state.eventDirector = {
      outingCount: 0,
      noEventStreak: 0,
      outingsSinceThreat: 3,
      recentMajor: [],
      lastBrotherLine: "",
      brotherQueue: [],
      squareReturnReady: false,
      follower: null,
      hunter: null
    };
  }

  const d = state.eventDirector;

  for (const key of [
    "outingCount",
    "noEventStreak",
    "outingsSinceThreat"
  ]) {
    if (!Number.isFinite(d[key])) d[key] = 0;
  }

  if (!Array.isArray(d.recentMajor)) d.recentMajor = [];
  if (!Array.isArray(d.brotherQueue)) d.brotherQueue = [];
  if (typeof d.lastBrotherLine !== "string") d.lastBrotherLine = "";
  if (typeof d.squareReturnReady !== "boolean") d.squareReturnReady = false;

  if (d.follower && typeof d.follower !== "object") d.follower = null;
  if (d.hunter && typeof d.hunter !== "object") d.hunter = null;
}

const v077PrepareBase = prepareSystems;
prepareSystems = function() {
  v077PrepareBase();
  v077EnsureSystems();
};

const V077_BROTHER_LINES = {
  van: [
    "Eu ouvi um carro parar lá fora. Ficou um tempo e depois foi embora.",
    "Tinha um motor ligado perto de casa. Eu não cheguei perto da janela.",
    "Um carro ficou parado aqui fora. Quando fui olhar pela cortina, já estava saindo."
  ],
  voices: [
    "Eu ouvi alguém falando baixo no corredor. Achei que fosse você.",
    "Uma voz chamou seu nome aqui dentro. Eu fiquei quieto porque você estava fora.",
    "Eu ouvi alguém sussurrando perto da escada. Não parecia vir da rua."
  ],
  knock: [
    "Bateram duas vezes na porta. Eu não respondi.",
    "Alguém mexeu na maçaneta e depois bateu. Eu fiquei no quarto.",
    "Eu ouvi batidas na entrada. Pararam quando eu cheguei perto do corredor."
  ],
  blackout: [
    "As luzes daqui piscaram junto com as da rua.",
    "Ficou tudo escuro por alguns segundos. O rádio fez um barulho estranho.",
    "A energia caiu e voltou. Quando voltou, a porta do corredor estava aberta."
  ],
  invasion: [
    "Eu ouvi alguma coisa andando lá embaixo. Não era passo normal.",
    "O trinco mexeu enquanto você estava fora. Eu me escondi e não fiz barulho.",
    "Tinha alguma coisa raspando perto da entrada. Depois ficou tudo quieto.",
    "Eu ouvi passos subindo e depois descendo de novo. Eu não saí do quarto."
  ],
  shadowFollower: [
    "Eu vi uma sombra passando pela janela. Ela parou quando eu cheguei perto.",
    "Tinha alguma coisa do outro lado da rua olhando para a casa.",
    "Eu achei que vi alguém seguindo você quando você saiu, mas não parecia uma pessoa."
  ],
  ambush: [
    "Eu ouvi alguma coisa correndo pelo quintal quando você estava fora.",
    "Teve um barulho forte lá fora, como se alguma coisa tivesse batido no muro.",
    "Eu ouvi um rosnado ou... não sei. Não parecia cachorro."
  ],
  windowScratch: [
    "Alguma coisa arranhou a janela do térreo. Três vezes.",
    "Eu ouvi unha ou metal raspando no vidro. Quando fui olhar, não tinha ninguém.",
    "A janela fez um barulho estranho. Parecia que alguém estava passando a mão do lado de fora."
  ],
  brotherEcho: [
    "Eu também achei que ouvi você me chamando. Mas você estava fora.",
    "Eu ouvi sua voz falando meu nome, só que vinha do andar de baixo.",
    "Parecia você me chamando da sala. Eu sabia que você não estava aqui."
  ],
  wetFootprints: [
    "Tinha marca molhada perto da escada. Eu limpei uma, mas apareceram outras.",
    "O chão do corredor ficou molhado sem ninguém entrar.",
    "Eu encontrei pegadas perto da sala. Elas terminavam no meio do corredor."
  ],
  distantSteps: [
    "Eu ouvi passos acompanhando os seus lá fora. Quando você parava, eles paravam.",
    "Tinha alguém andando do lado de fora no mesmo ritmo que você.",
    "Eu fiquei ouvindo passos na rua. Eles nunca chegaram na porta."
  ],
  observer: [
    "Na hora que você voltou da praça, a televisão chiou mesmo desligada.",
    "Quando você estava voltando, as luzes piscaram e eu ouvi um chiado muito alto."
  ]
};

function v077BrotherRemark(type) {
  prepareSystems();

  const options =
    V077_BROTHER_LINES[type] ||
    V077_BROTHER_LINES.voices;

  const available =
    options.filter(line =>
      line !== state.eventDirector.lastBrotherLine
    );

  const pool = available.length ? available : options;
  const line =
    pool[Math.floor(Math.random() * pool.length)];

  state.eventDirector.lastBrotherLine = line;
  return line;
}

function v077QueueBrotherRemark(type) {
  prepareSystems();

  const line = v077BrotherRemark(type);

  if (!state.pendingBrotherRemark) {
    state.pendingBrotherRemark = line;
    return;
  }

  if (
    !state.eventDirector.brotherQueue.includes(line) &&
    state.eventDirector.brotherQueue.length < 2
  ) {
    state.eventDirector.brotherQueue.push(line);
  }
}

function v077TriggerSquareObserver() {
  prepareSystems();

  if (
    !state.storyFlags.squareObserverArmed ||
    state.storyFlags.squareObserverSeen
  ) {
    return;
  }

  state.storyFlags.squareObserverArmed = false;
  state.storyFlags.squareObserverSeen = true;
  state.storyFlags.observerFirstSeen = true;
  state.storyFlags.southObserverPending = false;
  state.squareManReturnObserverPending = false;
  state.squareManReturnObserverSeenDay = state.day;
  state.eventDirector.squareReturnReady = false;

  v077ObserverUntil = elapsed + 0.95;
  v077ObserverStaticUntil = elapsed + 1.35;

  keys.clear();
  v077QueueBrotherRemark("observer");

  v06Toast(
    "Uma forma preta surgiu no caminho e desapareceu na estática.",
    2.7
  );

  updateHud();
  save();
}

function v077PoliceObserverReport() {
  prepareSystems();

  if (state.storyFlags.squareObserverReported) {
    say([
      ["Você", "Sobre aquele vulto que eu vi saindo da praça..."],
      ["Anísio", "Eu lembro. Sem descrição, testemunha ou marca física, não tenho o que registrar além do seu relato."],
      ["Anísio", "Se acontecer de novo, não siga a coisa."]
    ]);
    return;
  }

  say(
    [
      ["Você", "Quando eu estava saindo da praça, apareceu um vulto preto na minha frente."],
      ["Anísio", "Um vulto?"],
      ["Você", "Não parecia uma pessoa. As luzes falharam, começou um chiado e ele sumiu."],
      ["Anísio", "Você está há noites sem dormir direito procurando seus pais."],
      ["Você", "Eu sei o que eu vi."],
      ["Anísio", "Pode ter sido uma sombra, um animal ou cansaço. Não vou inventar uma ocorrência sem conseguir descrever o que estava ali."],
      ["Anísio", "Mas, se quer continuar procurando, existe uma estrada ao sul. Raimundo mora por lá e conhece histórias antigas da cidade."],
      ["Anísio", "Só não faça a besteira de seguir qualquer coisa para dentro da mata."]
    ],
    () => {
      state.storyFlags.squareObserverReported = true;

      v06Toast(
        "Nova rota · estrada de terra ao sul",
        2.6
      );

      updateHud();
      save();
    }
  );
}

// Capítulo 3 deixa de depender de "esperar o Dia 4".
// Agora depende da sequência investigativa que o jogador realmente cumpriu.
v0648Chapter3Unlocked = function() {
  prepareSystems();

  return Boolean(
    v0648Chapter2Unlocked() &&
    state.storyFlags?.marketParentsConfirmed &&
    state.squareManFirstSpeechDone &&
    state.storyFlags?.squareObserverSeen &&
    state.storyFlags?.squareObserverReported
  );
};

const v077PoliceTopicsBase = v0630OpenPoliceTopics;
v0630OpenPoliceTopics = function() {
  prepareSystems();

  const buttons = [];

  buttons.push([
    "Falar dos pais",
    () => {
      closeModal();
      v0630PoliceParents();
    }
  ]);

  if (state.storyFlags?.squareObserverSeen) {
    buttons.push([
      state.storyFlags.squareObserverReported
        ? "Falar novamente do vulto"
        : "Falar do vulto preto",
      () => {
        closeModal();
        v077PoliceObserverReport();
      }
    ]);
  }

  if (state.storyEvents.oldManEncounters > 0) {
    buttons.push([
      "Falar do Raimundo",
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

  if (state.chapter4?.bodySeen) {
    buttons.push([
      "Falar da rua oeste",
      () => {
        closeModal();
        v0649PoliceBody();
      }
    ]);
  }

  if (v0650Chapter5Unlocked()) {
    buttons.push([
      v0650HasContradiction("policeRecord")
        ? "Rever o registro estranho"
        : "Conferir um relatório",
      () => {
        closeModal();
        v0650PoliceContradiction();
      }
    ]);
  }

  if (
    state.sideQuests?.westCase?.garciaStatement ||
    state.sideQuests?.westCase?.evidenceFound
  ) {
    buttons.push([
      "Reabrir o caso da rua oeste",
      () => {
        closeModal();
        v070ResolveWestCase();
      }
    ]);
  }

  if (state.chapter8?.complete) {
    buttons.push([
      "Perguntar o que Anísio realmente pensa",
      () => {
        closeModal();
        v070PoliceInsight();
      }
    ]);
  }

  buttons.push(["Sair", closeModal]);

  modal(
    "Delegacia",
    "",
    buttons
  );
};

function v077WeightedChoice(items) {
  if (!items.length) return null;

  const total =
    items.reduce((sum, item) => sum + item.weight, 0);

  let roll = Math.random() * total;

  for (const item of items) {
    roll -= item.weight;
    if (roll <= 0) return item.id;
  }

  return items[0].id;
}

function v077ChooseMajorEvent() {
  prepareSystems();

  const d = state.eventDirector;

  const pool = [
    { id: "van", weight: 11, minDay: 1 },
    { id: "voices", weight: 14, minDay: 1 },
    { id: "knock", weight: 12, minDay: 2 },
    { id: "blackout", weight: 10, minDay: 2 },
    { id: "windowScratch", weight: 10, minDay: 2 },
    {
      id: "shadowFollower",
      weight: 13,
      minDay: 2,
      needsObserver: true
    },
    {
      id: "ambush",
      weight: 6,
      minDay: 2,
      needsObserver: true,
      needsThreatGap: true
    },
    {
      id: "invasion",
      weight: 7,
      minDay: 2,
      needsFinished: true,
      needsThreatGap: true
    }
  ].filter(item =>
    state.day >= item.minDay &&
    (!item.needsObserver || state.storyFlags.squareObserverSeen) &&
    (!item.needsFinished || state.finished) &&
    (!item.needsThreatGap || d.outingsSinceThreat >= 2) &&
    !d.recentMajor.includes(item.id)
  );

  return v077WeightedChoice(pool);
}

// Sai de casa sem evento também é uma possibilidade.
// Isso quebra o padrão previsível "porta -> ameaça -> irmão".
v0645ScheduleOutingEvent = function() {
  prepareSystems();

  const d = state.eventDirector;
  d.outingCount += 1;
  d.outingsSinceThreat += 1;

  // Mantém a van garantida da primeira noite.
  if (
    state.day === 1 &&
    !state.day1Progress?.vanSeen
  ) {
    state.randomEventState.pending = true;
    state.randomEventState.timer =
      5 + Math.random() * 3;
    state.randomEventState.type = "van";
    save();
    return;
  }

  // Durante a revelação praça -> policial, não empilha ameaça aleatória.
  if (
    (
      state.storyFlags.squareObserverArmed &&
      !state.storyFlags.squareObserverSeen
    ) ||
    (
      state.storyFlags.squareObserverSeen &&
      !state.storyFlags.squareObserverReported
    )
  ) {
    state.randomEventState.pending = false;
    state.smallEventState.pending = false;
    save();
    return;
  }

  const majorChance =
    d.noEventStreak >= 2
      ? 0.68
      : 0.42;

  const major =
    Math.random() < majorChance
      ? v077ChooseMajorEvent()
      : null;

  if (major) {
    state.randomEventState.pending = true;
    state.randomEventState.timer =
      8 + Math.random() * 10;
    state.randomEventState.type = major;

    d.noEventStreak = 0;
    d.recentMajor.push(major);
    d.recentMajor = d.recentMajor.slice(-2);

    if (major === "invasion" || major === "ambush") {
      d.outingsSinceThreat = 0;
    }
  } else {
    state.randomEventState.pending = false;
    d.noEventStreak += 1;
  }

  const smallPool = [
    { id: "windowLight", weight: 10, minDay: 2 },
    { id: "brotherEcho", weight: 8, minDay: 2 },
    { id: "foundFood", weight: 3, minDay: 2 },
    { id: "burntSmell", weight: 6, minDay: 3 },
    { id: "wetFootprints", weight: 8, minDay: 2 },
    { id: "distantSteps", weight: 9, minDay: 2 }
  ].filter(item => state.day >= item.minDay);

  if (
    smallPool.length &&
    Math.random() < 0.30
  ) {
    state.smallEventState.pending = true;
    state.smallEventState.timer =
      5 + Math.random() * 10;
    state.smallEventState.type =
      v077WeightedChoice(smallPool);
  } else {
    state.smallEventState.pending = false;
  }

  save();
};

function v077SpawnRelative(distance = 115) {
  const candidates = [
    [-distance, 0],
    [distance, 0],
    [0, -distance],
    [0, distance],
    [-distance * 0.75, -distance * 0.75],
    [distance * 0.75, distance * 0.75]
  ];

  const m = maps[state.room];

  for (const [dx, dy] of candidates) {
    const x = Math.max(28, Math.min(m.w - 28, state.x + dx));
    const y = Math.max(28, Math.min(m.h - 28, state.y + dy));

    if (!solid(x, y)) {
      return { x, y };
    }
  }

  return {
    x: Math.max(28, state.x - 90),
    y: state.y
  };
}

const v077TriggerEventBase = v0645TriggerRandomEvent;
v0645TriggerRandomEvent = function() {
  prepareSystems();

  const event = state.randomEventState;
  if (!event?.pending) return;

  const type = event.type;
  const previousBrotherRemark =
    state.pendingBrotherRemark || "";

  if (type === "shadowFollower") {
    event.pending = false;

    const spawn = v077SpawnRelative(130);

    state.eventDirector.follower = {
      active: true,
      room: state.room,
      x: spawn.x,
      y: spawn.y,
      time: 9
    };

    v06Toast(
      "Alguma coisa está acompanhando você do outro lado da rua.",
      2.7
    );

    v077QueueBrotherRemark("shadowFollower");
    save();
    return;
  }

  if (type === "ambush") {
    event.pending = false;

    const spawn = v077SpawnRelative(120);

    state.eventDirector.hunter = {
      active: true,
      room: state.room,
      x: spawn.x,
      y: spawn.y,
      hp: 2,
      flash: 0,
      time: 16
    };

    v06Toast(
      "Uma criatura escura saiu entre as casas. Ela está vindo na sua direção.",
      2.9
    );

    v077QueueBrotherRemark("ambush");
    save();
    return;
  }

  if (type === "windowScratch") {
    event.pending = false;

    v06Toast(
      "Um ruído de vidro raspando vem da direção da sua casa.",
      2.6
    );

    v077QueueBrotherRemark("windowScratch");
    save();
    return;
  }

  if (type === "wetFootprints") {
    event.pending = false;

    v06Toast(
      "Pegadas molhadas cruzam a calçada e terminam sem chegar a lugar nenhum.",
      2.7
    );

    v077QueueBrotherRemark("wetFootprints");
    save();
    return;
  }

  if (type === "distantSteps") {
    event.pending = false;

    v06Toast(
      "Passos acompanham o seu ritmo. Quando você para, eles param.",
      2.7
    );

    v077QueueBrotherRemark("distantSteps");
    save();
    return;
  }

  v077TriggerEventBase();

  if (
    ["van", "voices", "knock", "blackout", "invasion", "brotherEcho"]
      .includes(type)
  ) {
    const variant =
      v077BrotherRemark(type);

    if (!previousBrotherRemark) {
      // Substitui a fala fixa do sistema antigo por uma variante contextual.
      state.pendingBrotherRemark = variant;
    } else {
      // Se já havia uma observação pendente, não apaga a anterior.
      state.pendingBrotherRemark =
        previousBrotherRemark;

      if (
        !state.eventDirector.brotherQueue.includes(variant) &&
        state.eventDirector.brotherQueue.length < 2
      ) {
        state.eventDirector.brotherQueue.push(variant);
      }
    }
  }

  save();
};

const v077PunchBase = punchInvader;
punchInvader = function() {
  prepareSystems();

  const hunter = state.eventDirector?.hunter;

  if (
    hunter?.active &&
    hunter.room === state.room &&
    Math.hypot(
      hunter.x - state.x,
      hunter.y - state.y
    ) <= 48
  ) {
    if (state.danger?.punch > 0) return;

    if (state.danger) {
      state.danger.punch = 0.45;
    }

    hunter.hp -= 1;
    hunter.flash = 0.22;

    if (hunter.hp <= 0) {
      hunter.active = false;
      v077ThreatStaticUntil = elapsed + 0.65;

      v06Toast(
        "A criatura recua e desaparece entre as casas.",
        2.4
      );

      save();
    }

    return;
  }

  v077PunchBase();
};

function v077UpdateFollower(dt) {
  const follower = state.eventDirector?.follower;

  if (!follower?.active) return;

  follower.time -= dt;

  if (
    follower.room !== state.room ||
    follower.time <= 0
  ) {
    follower.active = false;
    v077ThreatStaticUntil = elapsed + 0.5;
    return;
  }

  const dx = state.x - follower.x;
  const dy = state.y - follower.y;
  const distance = Math.hypot(dx, dy) || 1;

  if (distance > 88) {
    const step = Math.min(22 * dt, distance - 84);

    const nx = follower.x + dx / distance * step;
    const ny = follower.y + dy / distance * step;

    if (!solid(nx, follower.y)) follower.x = nx;
    if (!solid(follower.x, ny)) follower.y = ny;
  }
}

function v077UpdateHunter(dt) {
  const hunter = state.eventDirector?.hunter;

  if (!hunter?.active) return;

  hunter.time -= dt;
  hunter.flash = Math.max(0, hunter.flash - dt);

  if (
    hunter.room !== state.room ||
    hunter.time <= 0
  ) {
    hunter.active = false;
    return;
  }

  const dx = state.x - hunter.x;
  const dy = state.y - hunter.y;
  const distance = Math.hypot(dx, dy) || 1;

  if (distance <= 19) {
    hunter.active = false;
    v077ThreatStaticUntil = elapsed + 0.8;
    keys.clear();

    v06Toast(
      "A criatura te alcança. Você consegue se soltar antes que ela desapareça.",
      2.8
    );

    save();
    return;
  }

  const step = Math.min(48 * dt, Math.max(0, distance - 16));

  const nx = hunter.x + dx / distance * step;
  const ny = hunter.y + dy / distance * step;

  if (!solid(nx, hunter.y)) hunter.x = nx;
  if (!solid(hunter.x, ny)) hunter.y = ny;
}

const v077UpdateBase = update;
update = function(dt) {
  v077UpdateBase(dt);

  if (
    !state ||
    mode !== "game" ||
    transitionBusy ||
    state.gameOver
  ) {
    return;
  }

  prepareSystems();

  // Promove a próxima fala contextual do irmão sem sobrescrever histórias.
  if (
    !state.pendingBrotherRemark &&
    state.eventDirector.brotherQueue.length &&
    !dialog
  ) {
    state.pendingBrotherRemark =
      state.eventDirector.brotherQueue.shift();
  }

  if (
    state.room === "square" &&
    state.storyFlags.squareObserverArmed &&
    !state.storyFlags.squareObserverSeen
  ) {
    if (state.x >= 850) {
      state.eventDirector.squareReturnReady = true;
    }

    if (
      state.eventDirector.squareReturnReady &&
      state.x <= 820 &&
      !dialog &&
      $("overlay").hidden
    ) {
      v077TriggerSquareObserver();
      return;
    }
  }

  if (
    !dialog &&
    $("overlay").hidden
  ) {
    // As ruas adicionadas na 0.7.6 também recebem eventos de rua.
    // No bairro principal o timer já é atualizado pelo sistema-base,
    // então aqui tratamos apenas as duas áreas novas.
    if (
      ["northRoad", "squareRoad"].includes(state.room) &&
      state.danger?.phase === "safe"
    ) {
      const randomEvent =
        state.randomEventState;

      if (randomEvent?.pending) {
        randomEvent.timer -= dt;

        if (randomEvent.timer <= 0) {
          v0645TriggerRandomEvent();
        }
      }

      if (state.smallEventState?.pending) {
        state.smallEventState.timer -= dt;

        if (state.smallEventState.timer <= 0) {
          v070TriggerSmallOutingEvent();
        }
      }
    }

    v077UpdateFollower(dt);
    v077UpdateHunter(dt);
  }
};

function v077DrawBlackShape(x, y, flash = 0) {
  const jitter =
    Math.sin(elapsed * 41) * 1.5;

  const body =
    flash > 0
      ? "#c8c9c4"
      : "#030405";

  rect(x - 15 + jitter, y - 26, 29, 18, body);
  rect(x - 20, y - 12, 40, 11, body);
  rect(x - 17, y - 3, 8, 14, body);
  rect(x + 9, y - 4, 8, 15, body);
  rect(x - 23, y - 17, 10, 6, "#050607");
  rect(x + 13, y - 17, 11, 6, "#050607");
}

const v077DrawBase = drawWorld;
drawWorld = function() {
  v077DrawBase();

  if (!state) return;

  prepareSystems();

  const follower =
    state.eventDirector?.follower;

  const hunter =
    state.eventDirector?.hunter;

  if (
    follower?.active &&
    follower.room === state.room
  ) {
    c.save();
    c.translate(
      -Math.floor(camera.x),
      -Math.floor(camera.y)
    );
    v077DrawBlackShape(
      follower.x,
      follower.y,
      0
    );
    c.restore();
  }

  if (
    hunter?.active &&
    hunter.room === state.room
  ) {
    c.save();
    c.translate(
      -Math.floor(camera.x),
      -Math.floor(camera.y)
    );
    v077DrawBlackShape(
      hunter.x,
      hunter.y,
      hunter.flash
    );
    c.restore();
  }

  // Mini jumpscare da primeira conversa com o homem da praça.
  if (
    state.room === "square" &&
    elapsed < v077ObserverUntil
  ) {
    const x = W * 0.58;
    const y = H * 0.63;
    const scale =
      1 + Math.sin(elapsed * 32) * 0.04;

    c.save();
    c.translate(x, y);
    c.scale(scale, scale);

    rect(-31, -52, 62, 31, "#020303");
    rect(-43, -27, 86, 23, "#010202");
    rect(-30, -5, 14, 34, "#010202");
    rect(16, -7, 14, 36, "#010202");
    rect(-48, -38, 20, 10, "#030404");
    rect(28, -36, 21, 10, "#030404");

    c.restore();
  }

  if (
    elapsed < v077ObserverStaticUntil ||
    elapsed < v077ThreatStaticUntil
  ) {
    const until =
      Math.max(
        v077ObserverStaticUntil,
        v077ThreatStaticUntil
      );

    const strength =
      Math.min(
        1,
        Math.max(until - elapsed, 0) / 0.8
      );

    for (let i = 0; i < 34; i++) {
      const y =
        (i * 17 + Math.floor(elapsed * 760)) % H;

      rect(
        -6 + (i % 3) * 3,
        y,
        W + 12,
        1 + (i % 4 === 0 ? 2 : 0),
        "rgba(225,230,220," +
          (0.05 + strength * 0.16) +
          ")"
      );
    }

    if (Math.floor(elapsed * 28) % 3 === 0) {
      rect(
        0,
        0,
        W,
        H,
        "rgba(210,215,210," +
          (0.04 + strength * 0.11) +
          ")"
      );
    }
  }
};

const v077EdgeNoticeBase = v0639EdgeNotice;
v0639EdgeNotice = function(message) {
  prepareSystems();

  if (
    message ===
      "Ainda preciso procurar meus pais nas áreas mais próximas." ||
    message ===
      "Antes de ir tão longe, preciso confirmar o que aconteceu no mercado e na praça."
  ) {
    if (!state.storyFlags?.marketParentsConfirmed) {
      message =
        "Primeiro preciso confirmar no mercado se meus pais passaram por lá.";
    } else if (!state.squareManFirstSpeechDone) {
      message =
        "Ainda preciso falar com o homem de cadeira de rodas na praça.";
    } else if (!state.storyFlags.squareObserverSeen) {
      message =
        "Alguma coisa ficou pendente na praça. Preciso voltar lá.";
    } else if (!state.storyFlags.squareObserverReported) {
      message =
        "Antes de seguir pela estrada, preciso contar ao Anísio o que vi saindo da praça.";
    }
  }

  v077EdgeNoticeBase(message);
};

const V077_DAWN_BROTHER_SCENES = [
  [
    ["Irmão", "Eu acordei com alguém andando na sala."],
    ["Irmão", "Os passos pararam bem no pé da escada."]
  ],
  [
    ["Irmão", "A maçaneta do corredor mexeu uma vez."],
    ["Irmão", "Eu fiquei quieto. Depois não ouvi mais nada."]
  ],
  [
    ["Irmão", "Eu achei que você tinha voltado antes."],
    ["Irmão", "Ouvi passos lá embaixo, mas a porta nunca abriu."]
  ],
  [
    ["Irmão", "Teve um barulho na sala enquanto você estava fora."],
    ["Irmão", "Parecia alguém andando devagar, tentando não fazer barulho."]
  ]
];

const v077InteractBase = interact;
interact = function(action) {
  prepareSystems();

  if (
    action === "brother" &&
    state.dawnCollapseCount > state.brotherDawnTalkCount
  ) {
    state.brotherDawnTalkCount =
      state.dawnCollapseCount;

    const index =
      Math.abs(
        (state.day || 0) +
        state.dawnCollapseCount
      ) % V077_DAWN_BROTHER_SCENES.length;

    say(
      V077_DAWN_BROTHER_SCENES[index],
      save
    );

    return;
  }

  if (action === "southLocked") {
    if (!state.storyFlags?.marketParentsConfirmed) {
      say([
        "Primeiro preciso confirmar no mercado se meus pais realmente passaram por lá."
      ]);
      return;
    }

    if (!state.squareManFirstSpeechDone) {
      say([
        "Antes de ir tão longe, preciso falar com o homem de cadeira de rodas na praça."
      ]);
      return;
    }

    if (!state.storyFlags.squareObserverSeen) {
      say([
        "Ainda tem alguma coisa estranha ligada à praça. Preciso voltar lá."
      ]);
      return;
    }

    if (!state.storyFlags.squareObserverReported) {
      say([
        "Eu vi alguma coisa saindo da praça. Antes de seguir sozinho para a estrada, vou contar ao Anísio."
      ]);
      return;
    }
  }

  v077InteractBase(action);
};

const v077HudBase = updateHud;
updateHud = function() {
  v077HudBase();

  if (
    !state ||
    state.stage === "prologue"
  ) {
    return;
  }

  prepareSystems();

  if (
    v0648Chapter2Unlocked() &&
    state.storyFlags?.marketParentsConfirmed &&
    state.squareManFirstSpeechDone &&
    !state.storyFlags?.raimundoMet
  ) {
    if (!state.storyFlags.squareObserverSeen) {
      $("objective").textContent =
        state.room === "square"
          ? "Saia da região do homem da praça e volte pelo caminho de entrada."
          : "Volte à praça. Algo ficou pendente depois da conversa com o homem de cadeira de rodas.";
      return;
    }

    if (!state.storyFlags.squareObserverReported) {
      $("objective").textContent =
        "Conte ao Anísio, na delegacia, sobre o vulto preto que apareceu na praça.";
      return;
    }

    $("objective").textContent =
      "Siga pela estrada de terra ao sul e fale com Raimundo.";
  }
};

// =========================================================
// 0.7.8 — DESMAIO VISÍVEL EM QUALQUER MAPA + PRAÇA AUTOMÁTICA
// =========================================================

// Algumas áreas externas desenham o mapa por um caminho próprio e pulavam
// a camada antiga do desmaio. Este sinal permite um passe final de segurança.
let v078DawnOverlayDrawnThisFrame = false;

function v078DrawDawnCollapseOverlay() {
  if (!state?.dawnCollapse?.active) return;

  const collapse = state.dawnCollapse;

  if (collapse.phase === "dizzy") {
    const p =
      Math.min(1, collapse.time / 2.2);

    // Vinheta/escurecimento crescente.
    rect(
      0,
      0,
      W,
      H,
      "rgba(7,9,12," +
        (0.16 + p * 0.60) +
        ")"
    );

    // Interferência horizontal.
    for (let i = 0; i < 18; i++) {
      const y =
        (
          i * 27 +
          Math.sin(elapsed * 8 + i) * 11 +
          H
        ) % H;

      const alpha =
        0.04 + p * 0.13;

      rect(
        Math.sin(elapsed * 11 + i) * 10,
        y,
        W + 18,
        2 + (i % 4),
        "rgba(220,224,216," +
          alpha +
          ")"
      );
    }

    // Pequenos cortes laterais dão sensação de perda de equilíbrio.
    const sway =
      Math.sin(elapsed * 10) * 8 * p;

    rect(
      sway - 10,
      0,
      12,
      H,
      "rgba(185,178,163," +
        (0.03 + p * 0.08) +
        ")"
    );

    if (collapse.time > 0.45) {
      txt(
        collapse.time < 1.2
          ? "Minha cabeça..."
          : "Eu não consigo ficar em pé.",
        24,
        H - 28,
        "#ded7c4",
        8
      );
    }
  }

  if (collapse.phase === "black") {
    rect(0, 0, W, H, "#000");

    if (
      collapse.time > 0.35 &&
      collapse.time < 1.05
    ) {
      txt(
        "...",
        W / 2 - 8,
        H / 2,
        "#77736b",
        10
      );
    }
  }

  if (collapse.phase === "dayCard") {
    rect(0, 0, W, H, "#000");

    const previousDay =
      Math.max(1, state.day || 1);

    const nextDay =
      previousDay + 1;

    const t =
      collapse.time;

    // "DIA 2" desce e então vira "DIA 3", por exemplo.
    const drop =
      Math.min(1, t / 1.15);

    const easedDrop =
      1 - Math.pow(1 - drop, 3);

    const titleY =
      -28 +
      (H / 2 + 24) * easedDrop;

    const shownDay =
      t < 1.45
        ? previousDay
        : nextDay;

    const fadeOut =
      t < 2.65
        ? 1
        : Math.max(
            0,
            1 - (t - 2.65) / 0.65
          );

    c.save();
    c.globalAlpha = fadeOut;

    txt(
      "DIA " + shownDay,
      W / 2 - 34,
      titleY,
      "#d8d1bc",
      14
    );

    if (t >= 1.45) {
      txt(
        "00:00",
        W / 2 - 18,
        titleY + 22,
        "#9f9989",
        9
      );
    }

    c.restore();
  }
}

const v078DrawBase = drawWorld;
drawWorld = function() {
  v078DawnOverlayDrawnThisFrame = false;

  v078DrawBase();

  // Se o mapa atual pulou a implementação de 0.6.32, desenha a mesma
  // sequência no topo de tudo. Assim nenhuma área pode esconder o desmaio.
  if (
    state?.dawnCollapse?.active &&
    !v078DawnOverlayDrawnThisFrame
  ) {
    v078DrawDawnCollapseOverlay();
  }
};

// A rua da praça não precisa mais de um ponto de interação com [E].
if (maps.squareRoad?.doors) {
  maps.squareRoad.doors =
    maps.squareRoad.doors.filter(
      door =>
        door.action !==
        "squareRoadEntrance"
    );
}

function v078EnterSquareAutomatically() {
  if (
    !state ||
    state.room !== "squareRoad" ||
    transitionBusy ||
    dialog
  ) {
    return;
  }

  fade(
    "Praça central",
    "Fim da rua leste",
    () => {
      const firstVisit =
        !state.storyFlags.squareVisited;

      state.storyFlags.squareVisited = true;
      state.storyFlags.squareVisitCount =
        (state.storyFlags.squareVisitCount || 0) + 1;

      v076SetOutdoorRoom(
        "square",
        82,
        500,
        "right"
      );

      if (firstVisit) {
        v06Toast(
          "Praça central · procure alguém que possa ter visto seus pais.",
          2.6
        );
      }
    }
  );
}

const v078UpdateBase = update;
update = function(dt) {
  v078UpdateBase(dt);

  if (
    !state ||
    mode !== "game" ||
    dialog ||
    transitionBusy ||
    !$("overlay").hidden ||
    state.dawnCollapse?.active ||
    state.wakeUp?.active
  ) {
    return;
  }

  const right =
    keys.has("d") ||
    keys.has("arrowright");

  // O limite físico do mapa já impede sair da tela. Ao continuar andando
  // para a direita no fim da rua, a praça é carregada automaticamente.
  const squareRoadThreshold =
    maps.squareRoad.w -
    housePoint(58);

  if (
    state.room === "squareRoad" &&
    state.x >= squareRoadThreshold &&
    right
  ) {
    state.x = squareRoadThreshold;
    v078EnterSquareAutomatically();
  }
};

// =========================================================
// 0.7.9 — SONO VOLUNTÁRIO DEPOIS DAS 03:00
// =========================================================

function v079NightSleepAvailable() {
  if (
    !state ||
    state.stage === "prologue" ||
    state.gameOver ||
    state.dawnCollapse?.active ||
    state.wakeUp?.active
  ) {
    return false;
  }

  // Janela voluntária: das 03:00 até antes do colapso das 07:00.
  if (
    state.minutes < 180 ||
    state.minutes >= 420
  ) {
    return false;
  }

  // A primeira noite não pode ser pulada antes de concluir a investigação-base.
  if (
    state.day === 1 &&
    !state.day1Progress?.completed
  ) {
    return false;
  }

  if (dangerActive()) {
    return false;
  }

  const director =
    state.eventDirector;

  if (
    director?.hunter?.active ||
    director?.follower?.active
  ) {
    return false;
  }

  return true;
}

function v079SleepBlockedReason() {
  if (!state) {
    return "Não consigo dormir agora.";
  }

  if (
    state.day === 1 &&
    !state.day1Progress?.completed &&
    state.minutes >= 180 &&
    state.minutes < 420
  ) {
    return "Ainda não. Preciso terminar o que comecei esta noite antes de dormir.";
  }

  if (
    dangerActive() ||
    state.eventDirector?.hunter?.active ||
    state.eventDirector?.follower?.active
  ) {
    return "Não posso dormir enquanto alguma coisa está rondando a casa.";
  }

  return "Ainda não estou com sono suficiente.";
}

function v079SleepUntilNextNight() {
  prepareSystems();

  if (!v079NightSleepAvailable()) {
    say([
      v079SleepBlockedReason()
    ]);
    return;
  }

  const currentDay =
    Math.max(1, state.day || 1);

  const nextDay =
    currentDay + 1;

  modal(
    "Dormir até a próxima noite?",
    "Já passou das 03:00.\n\nDormir agora encerra esta noite e você acorda às 00:00 do DIA " +
      nextDay +
      ".\n\nAcontecimentos aleatórios desta noite podem se encerrar, mas investigações iniciadas continuam no próximo dia.",
    [
      [
        "Dormir",
        () => {
          closeModal();

          fade(
            "Você decide descansar",
            "DIA " +
              currentDay +
              " → DIA " +
              nextDay +
              " · 00:00",
            () => {
              state.day = nextDay;
              state.minutes = 0;
              state.sun = 0;
              state.forcedSleepDue = false;
              state.dawnCollapseArmed = true;

              // O sono voluntário não conta como desmaio das 07:00.
              if (state.dawnCollapse) {
                state.dawnCollapse.active = false;
                state.dawnCollapse.phase = "idle";
                state.dawnCollapse.time = 0;
              }

              if (state.wakeUp) {
                state.wakeUp.active = false;
                state.wakeUp.time = 0;
              }

              // Cancela acontecimentos aleatórios daquela saída/noite.
              if (state.randomEventState) {
                state.randomEventState.pending = false;
              }

              if (state.smallEventState) {
                state.smallEventState.pending = false;
              }

              if (state.eventDirector) {
                if (state.eventDirector.follower) {
                  state.eventDirector.follower.active = false;
                }

                if (state.eventDirector.hunter) {
                  state.eventDirector.hunter.active = false;
                }
              }

              // Acorda sempre no próprio quarto.
              state.room = "bedroom";
              state.x = housePoint(180);
              state.y = housePoint(235);
              state.facing = "down";
              state.walk = 0;

              keys.clear();
              near = null;
              $("prompt").hidden = true;

              if (typeof v06AbsoluteMinutes === "function") {
                state.foodClock = v06AbsoluteMinutes();
              }

              updateHud();
              save();

              say([
                [
                  "Você",
                  "Consegui dormir um pouco. Já é meia-noite de novo."
                ]
              ]);
            }
          );
        }
      ],
      ["Agora não", closeModal]
    ]
  );
}

const v079GetNearBase = getNear;
getNear = function() {
  const target =
    v079GetNearBase();

  if (
    target?.action === "bed" &&
    state &&
    state.minutes >= 180 &&
    state.minutes < 420
  ) {
    return {
      ...target,
      label: v079NightSleepAvailable()
        ? "Dormir até a próxima noite"
        : "Tentar dormir"
    };
  }

  return target;
};

const v079InteractBase = interact;
interact = function(action) {
  prepareSystems();

  if (
    action === "bed" &&
    state &&
    state.minutes >= 180 &&
    state.minutes < 420
  ) {
    v079SleepUntilNextNight();
    return;
  }

  v079InteractBase(action);
};

const v079HudBase = updateHud;
updateHud = function() {
  v079HudBase();

  if (
    !state ||
    state.stage === "prologue" ||
    state.minutes < 180 ||
    state.minutes >= 420
  ) {
    return;
  }

  if (
    v079NightSleepAvailable() &&
    state.room === "bedroom"
  ) {
    $("timeNote").textContent =
      "DEPOIS DAS 03:00 · VOCÊ PODE DORMIR";
  }
};

// =========================================================
// 0.8.0 — FORGOTTEN VIVA
// FRAGMENTOS PÓS-RAIMUNDO + EXPLORAÇÃO COM PROGRESSO
// =========================================================

const V080_OSMAR_POS = {
  x: 592,
  y: 750
};

const V080_YARD_TRACE_POS = {
  x: 586,
  y: 620
};

const V080_OUTDOOR_ROOMS = [
  "village",
  "northRoad",
  "squareRoad",
  "square",
  "oldRoad"
];

const V080_AMBIENT_TEXTURES = [
  {
    id: "curtain",
    text: "Uma cortina se fecha assim que você olha para a janela."
  },
  {
    id: "festivalPoster",
    text: "Um cartaz antigo de festival tem duas datas impressas uma sobre a outra."
  },
  {
    id: "emptyPorch",
    text: "A varanda de uma casa vazia está molhada. A rua ao redor continua seca."
  },
  {
    id: "residentAvoids",
    text: "Um morador atravessa para o outro lado da rua antes de passar por você."
  },
  {
    id: "wrongLamp",
    text: "Uma janela acende por alguns segundos numa casa que parece abandonada."
  }
];

let v080WestPresenceUntil = 0;
let v080WestStaticUntil = 0;
let v080WestPresenceY = 420;

function v080EnsureForgottenAlive() {
  if (!state) return;

  if (
    !state.forgottenAlive ||
    typeof state.forgottenAlive !== "object"
  ) {
    state.forgottenAlive = {};
  }

  const f =
    state.forgottenAlive;

  if (typeof f.started !== "boolean") {
    f.started = false;
  }

  if (!Number.isFinite(f.startedDay)) {
    f.startedDay = -1;
  }

  if (!f.completed || typeof f.completed !== "object") {
    f.completed = {};
  }

  for (const id of [
    "marketDrift",
    "osmar",
    "brotherYard",
    "mineArchive"
  ]) {
    if (typeof f.completed[id] !== "boolean") {
      f.completed[id] = false;
    }
  }

  if (!Number.isFinite(f.marketDriftStage)) {
    f.marketDriftStage = 0;
  }

  if (!Number.isFinite(f.marketDriftDay)) {
    f.marketDriftDay = -1;
  }

  if (!Number.isFinite(f.osmarStage)) {
    f.osmarStage = 0;
  }

  if (!Number.isFinite(f.osmarAttempts)) {
    f.osmarAttempts = 0;
  }

  if (!Number.isFinite(f.brotherYardStage)) {
    f.brotherYardStage = 0;
  }

  if (typeof f.westPresenceArmed !== "boolean") {
    f.westPresenceArmed = false;
  }

  if (typeof f.westPresenceSeen !== "boolean") {
    f.westPresenceSeen = false;
  }

  if (typeof f.westHintShown !== "boolean") {
    f.westHintShown = false;
  }

  if (!Number.isFinite(f.explorationDay)) {
    f.explorationDay = state.day;
  }

  if (!Array.isArray(f.seenCells)) {
    f.seenCells = [];
  }

  if (!Number.isFinite(f.cellsSinceAmbient)) {
    f.cellsSinceAmbient = 0;
  }

  if (!Number.isFinite(f.ambientCount)) {
    f.ambientCount = 0;
  }

  if (!Array.isArray(f.ambientRecent)) {
    f.ambientRecent = [];
  }

  if (!Number.isFinite(f.ambientSilence)) {
    f.ambientSilence = 0;
  }

  if (
    state.storyFlags?.raimundoMet &&
    !f.started
  ) {
    f.started = true;
    f.startedDay = state.day;
  }

  // Saves que já chegaram à Rua Oeste nunca são obrigados
  // a refazer os novos Fragmentos.
  const alreadyPastForgottenAlive =
    Boolean(
      state.storyFlags?.chapter4Complete ||
      state.chapter4?.bodySeen ||
      state.chapter4?.bodyReported ||
      state.storyFlags?.florindaChapter4Concern ||
      state.flashlight?.owned ||
      state.room === "westRoad"
    );

  if (alreadyPastForgottenAlive) {
    f.westPresenceSeen = true;
    f.westPresenceArmed = false;
  }

  // O sono nunca apaga Fragmentos. Só reinicia o orçamento ambiental
  // da sessão de exploração do novo dia.
  if (f.explorationDay !== state.day) {
    f.explorationDay = state.day;
    f.seenCells = [];
    f.cellsSinceAmbient = 0;
    f.ambientCount = 0;
    f.ambientSilence = 0;
  }
}

const v080PrepareBase = prepareSystems;
prepareSystems = function() {
  v080PrepareBase();
  v080EnsureForgottenAlive();

  if (!state?.forgottenAlive) return;

  v080UpdateWestPresenceArming(false);
};

function v080ForgottenAliveActive() {
  const f =
    state?.forgottenAlive;

  return Boolean(
    state &&
    state.stage !== "prologue" &&
    state.storyFlags?.raimundoMet &&
    f?.started &&
    !f.westPresenceSeen &&
    !state.storyFlags?.chapter4Complete
  );
}

function v080FragmentCount() {
  const completed =
    state?.forgottenAlive?.completed || {};

  return [
    completed.marketDrift,
    completed.osmar,
    completed.brotherYard,
    completed.mineNewspaper
  ].filter(Boolean).length;
}

function v080UpdateWestPresenceArming(showToast = true) {
  if (!state?.forgottenAlive) return false;

  const f =
    state.forgottenAlive;

  if (
    f.westPresenceSeen ||
    f.westPresenceArmed ||
    !state.storyFlags?.raimundoMet ||
    !state.storyFlags?.mineExteriorSeen ||
    v080FragmentCount() < 3
  ) {
    return false;
  }

  f.westPresenceArmed = true;

  if (showToast && !f.westHintShown) {
    f.westHintShown = true;

    v06Toast(
      "As novas informações começam a apontar para o lado oeste de Forgotten.",
      3
    );
  }

  return true;
}

function v080CompleteFragment(id, title) {
  prepareSystems();

  const f =
    state.forgottenAlive;

  if (f.completed[id]) {
    return false;
  }

  f.completed[id] = true;

  v06Toast(
    "Fragmento de Forgotten · " + title,
    2.8
  );

  const armed =
    v080UpdateWestPresenceArming(true);

  updateHud();
  save();

  if (armed) {
    // O toast de liberação é mais importante que o nome do Fragmento.
    // Ele é exibido pelo armamento logo após a descoberta.
  }

  return true;
}

function v080MarketDrift() {
  prepareSystems();

  const f =
    state.forgottenAlive;

  if (f.marketDriftStage === 0) {
    say(
      [
        ["Você", "Você ainda lembra de quando meus pais saíram daqui?"],
        ["Funcionário", "Lembro... quer dizer, achei que lembrava."],
        ["Funcionário", "Eu te disse que os dois saíram juntos, não disse?"],
        ["Você", "Disse."],
        ["Funcionário", "Pensando melhor, seu pai ficou alguns segundos perto da porta. Sua mãe ainda estava no caixa."],
        ["Você", "Então eles não saíram juntos?"],
        ["Funcionário", "Eu não sei. Isso é que está me incomodando. Ontem eu tinha certeza."]
      ],
      () => {
        f.marketDriftStage = 1;
        f.marketDriftDay = state.day;

        v080CompleteFragment(
          "marketDrift",
          "O relato que muda"
        );
      }
    );

    return true;
  }

  if (
    f.marketDriftStage === 1 &&
    state.day > f.marketDriftDay
  ) {
    say(
      [
        ["Você", "Conseguiu lembrar melhor daquele dia?"],
        ["Funcionário", "Piorou."],
        ["Funcionário", "Hoje eu lembro sua mãe saindo primeiro."],
        ["Você", "Ontem você falou do meu pai perto da porta."],
        ["Funcionário", "Eu sei."],
        ["Funcionário", "Não escreve nenhuma dessas versões como verdade. Eu não confio mais na minha própria lembrança."]
      ],
      () => {
        f.marketDriftStage = 2;
        save();
      }
    );

    return true;
  }

  return false;
}

function v080SeedOsmar() {
  prepareSystems();

  const f =
    state.forgottenAlive;

  if (
    !v080ForgottenAliveActive() ||
    f.osmarStage !== 0
  ) {
    return false;
  }

  say(
    [
      ["Florinda", "Fiquei pensando depois que você saiu... talvez eu consiga ajudar de verdade."],
      ["Você", "Como?"],
      ["Florinda", "Meu filho, Osmar, mora na rua do mercado. Ele passa muito tempo olhando o movimento dali."],
      ["Você", "Por que não falou dele antes?"],
      ["Florinda", "Porque não gosto de colocar ele no meio dos problemas dos outros."],
      ["Florinda", "Mas seus pais sumiram. Pergunta por ele naquela rua. A casa fica do lado direito, perto de uma caixa de correio velha."]
    ],
    () => {
      f.osmarStage = 1;
      updateHud();
      save();
    }
  );

  return true;
}

function v080OsmarHomeNow() {
  // Conteúdo importante fica concentrado antes das 03:00.
  return Boolean(
    state &&
    state.minutes >= 0 &&
    state.minutes < 180
  );
}

function v080TalkOsmar() {
  prepareSystems();

  const f =
    state.forgottenAlive;

  if (f.osmarStage <= 0) {
    return;
  }

  if (f.completed.osmar) {
    say([
      ["Você", "Lembrou de mais alguma coisa?"],
      ["Osmar", "Não. Eu vi os dois entrando no mercado. Depois disso, não prestei atenção."],
      ["Osmar", "Se eu lembrar de algo diferente, eu mesmo falo com minha mãe."]
    ]);
    return;
  }

  if (!v080OsmarHomeNow()) {
    f.osmarAttempts += 1;

    say(
      f.osmarAttempts <= 1
        ? [
            "A casa está escura. Parece que Osmar não está em casa."
          ]
        : [
            "Ninguém atende.",
            "Na caixa de correio há um papel preso: “Chego depois da meia-noite. Se precisar, venha antes das três.”"
          ],
      save
    );

    return;
  }

  say(
    [
      ["Osmar", "Oi? Precisa de alguma coisa?"],
      ["Você", "A Florinda é sua mãe?"],
      ["Osmar", "É. Aconteceu alguma coisa com ela?"],
      ["Você", "Não. Meus pais desapareceram. Ela disse que talvez você tivesse visto eles."],
      ["Osmar", "Os Lancaster?"],
      ["Você", "Foi por volta das duas da tarde, alguns dias atrás."],
      ["Osmar", "Eu vi um homem e uma mulher subindo essa rua. Não posso jurar que eram seus pais."],
      ["Você", "Para onde eles foram?"],
      ["Osmar", "Entraram no mercado. Eu não vi quando saíram."],
      ["Osmar", "Desculpa. É só isso que eu consigo afirmar sem inventar."]
    ],
    () => {
      f.osmarStage = 2;

      v080CompleteFragment(
        "osmar",
        "O filho de Florinda"
      );
    }
  );
}

function v080SeedBrotherYard() {
  prepareSystems();

  const f =
    state.forgottenAlive;

  if (
    !v080ForgottenAliveActive() ||
    f.brotherYardStage !== 0
  ) {
    return false;
  }

  if (
    state.pendingBrotherRemark ||
    (
      state.sideQuests?.brotherToy?.found &&
      !state.sideQuests.brotherToy.returned
    ) ||
    state.food > 0 ||
    state.dawnCollapseCount > state.brotherDawnTalkCount
  ) {
    return false;
  }

  say(
    [
      ["Irmão", "Posso te contar uma coisa sem você achar que eu inventei?"],
      ["Você", "Pode."],
      ["Irmão", "Tinha alguém no quintal quando você estava fora."],
      ["Você", "Você viu quem era?"],
      ["Irmão", "Não direito. Eu vi uma parte escura passando perto do muro."],
      ["Irmão", "Depois eu olhei de novo e não tinha ninguém."],
      ["Você", "Fica dentro de casa. Eu vou olhar."]
    ],
    () => {
      f.brotherYardStage = 1;
      updateHud();
      save();
    }
  );

  return true;
}

function v080InspectYardTrace() {
  prepareSystems();

  const f =
    state.forgottenAlive;

  if (f.brotherYardStage !== 1) {
    return;
  }

  say(
    [
      "A terra perto do muro está remexida.",
      "Há uma marca funda, como se alguma coisa pesada tivesse parado aqui por alguns segundos.",
      "Preso numa farpa da madeira existe um fio escuro. Não parece tecido de nenhuma roupa da casa.",
      "Isso não prova que meu irmão viu uma pessoa. Mas alguma coisa esteve aqui."
    ],
    () => {
      f.brotherYardStage = 2;

      v080CompleteFragment(
        "brotherYard",
        "Alguém no quintal"
      );
    }
  );
}

function v080TriggerWestPresence() {
  prepareSystems();

  const f =
    state.forgottenAlive;

  if (
    !f.westPresenceArmed ||
    f.westPresenceSeen
  ) {
    return;
  }

  f.westPresenceArmed = false;
  f.westPresenceSeen = true;

  v080WestPresenceY =
    Math.max(
      330,
      Math.min(520, state.y)
    );

  v080WestPresenceUntil =
    elapsed + 1.05;

  v080WestStaticUntil =
    elapsed + 1.35;

  keys.clear();

  v06Toast(
    "A mesma presença escura aparece na direção da Rua Oeste — e some quando você olha direto.",
    3
  );

  updateHud();
  save();
}

// Capítulo 4 não depende mais de simplesmente esperar chegar ao Dia 6.
// Saves que JÁ iniciaram a Rua Oeste continuam válidos por evidência real
// de progresso; só chegar a um número de dia não libera conteúdo.
v0649Chapter4Unlocked = function() {
  const f =
    state?.forgottenAlive;

  const legacyProgress =
    Boolean(
      state?.storyFlags?.chapter4Complete ||
      state?.chapter4?.bodySeen ||
      state?.chapter4?.bodyReported ||
      state?.storyFlags?.florindaChapter4Concern ||
      state?.flashlight?.owned ||
      state?.room === "westRoad"
    );

  if (legacyProgress) {
    return true;
  }

  return Boolean(
    state &&
    state.stage !== "prologue" &&
    state.storyFlags?.raimundoMet &&
    state.storyFlags?.mineExteriorSeen &&
    f?.westPresenceSeen
  );
};

const v080ScheduleOutingBase =
  v0645ScheduleOutingEvent;

v0645ScheduleOutingEvent = function() {
  v080ScheduleOutingBase();

  if (!state) return;

  prepareSystems();

  // Durante os Fragmentos, ataques grandes não caem soltos por sorte.
  // Presenças e atmosfera continuam possíveis; invasões/emboscadas
  // voltam ao pool depois que a thread da Rua Oeste foi concluída.
  if (
    v080ForgottenAliveActive() &&
    state.randomEventState?.pending &&
    ["ambush", "invasion"].includes(
      state.randomEventState.type
    )
  ) {
    state.randomEventState.type =
      Math.random() < 0.5
        ? "voices"
        : "blackout";
  }
};

function v080AmbientCandidate() {
  const f =
    state.forgottenAlive;

  const candidates =
    V080_AMBIENT_TEXTURES.filter(item =>
      !f.ambientRecent.includes(item.id)
    );

  const pool =
    candidates.length
      ? candidates
      : V080_AMBIENT_TEXTURES;

  return pool[
    Math.floor(Math.random() * pool.length)
  ];
}

function v080RegisterExplorationCell() {
  if (
    !v080ForgottenAliveActive() ||
    !V080_OUTDOOR_ROOMS.includes(state.room)
  ) {
    return;
  }

  const f =
    state.forgottenAlive;

  const cell =
    state.room +
    ":" +
    Math.floor(state.x / 240) +
    ":" +
    Math.floor(state.y / 240);

  if (f.seenCells.includes(cell)) {
    return;
  }

  f.seenCells.push(cell);
  f.cellsSinceAmbient += 1;

  // Protege o save de listas que cresçam para sempre.
  if (f.seenCells.length > 80) {
    f.seenCells =
      f.seenCells.slice(-80);
  }
}

function v080TryAmbientTexture() {
  if (
    !v080ForgottenAliveActive() ||
    state.forgottenAlive.westPresenceArmed ||
    dialog ||
    transitionBusy ||
    !$("overlay").hidden ||
    dangerActive() ||
    state.eventDirector?.hunter?.active
  ) {
    return;
  }

  const f =
    state.forgottenAlive;

  if (f.ambientSilence > 0) {
    return;
  }

  // Antes das 03:00, Forgotten oferece mais textura.
  // Depois das 03:00 o limiar sobe: ficar acordado pode render algo,
  // mas dormir cedo não elimina Fragmentos.
  const threshold =
    state.minutes < 180
      ? 4
      : 6;

  const maxPerNight =
    state.minutes < 180
      ? 2
      : 1;

  if (
    f.cellsSinceAmbient < threshold ||
    f.ambientCount >= maxPerNight
  ) {
    return;
  }

  const event =
    v080AmbientCandidate();

  if (!event) return;

  f.cellsSinceAmbient = 0;
  f.ambientCount += 1;
  f.ambientSilence = 28;

  f.ambientRecent.push(event.id);
  f.ambientRecent =
    f.ambientRecent.slice(-3);

  v06Toast(
    event.text,
    2.7
  );

  save();
}

const v080GetNearBase = getNear;
getNear = function() {
  prepareSystems();

  const f =
    state?.forgottenAlive;

  if (
    f &&
    state.room === "northRoad" &&
    f.osmarStage >= 1 &&
    Math.hypot(
      state.x - V080_OSMAR_POS.x,
      state.y - V080_OSMAR_POS.y
    ) < 48
  ) {
    return {
      label: f.completed.osmar
        ? "Falar com Osmar"
        : "Bater na casa de Osmar",
      action: "v080Osmar"
    };
  }

  if (
    f &&
    state.room === "village" &&
    f.brotherYardStage === 1 &&
    Math.hypot(
      state.x - V080_YARD_TRACE_POS.x,
      state.y - V080_YARD_TRACE_POS.y
    ) < 48
  ) {
    return {
      label: "Examinar o quintal",
      action: "v080YardTrace"
    };
  }

  return v080GetNearBase();
};

const v080InteractBase = interact;
interact = function(action) {
  prepareSystems();

  if (action === "v080Osmar") {
    v080TalkOsmar();
    return;
  }

  if (action === "v080YardTrace") {
    v080InspectYardTrace();
    return;
  }

  if (
    action === "marketClerk" &&
    state.storyFlags?.raimundoMet &&
    !state.forgottenAlive.westPresenceSeen
  ) {
    if (v080MarketDrift()) {
      return;
    }
  }

  if (
    action === "vendor" &&
    state.storyFlags?.raimundoMet &&
    !state.forgottenAlive.westPresenceSeen
  ) {
    if (v080SeedOsmar()) {
      return;
    }
  }

  if (
    action === "brother" &&
    state.storyFlags?.raimundoMet &&
    !state.forgottenAlive.westPresenceSeen
  ) {
    if (v080SeedBrotherYard()) {
      return;
    }
  }

  v080InteractBase(action);
};

const v080UpdateBase = update;
update = function(dt) {
  v080UpdateBase(dt);

  if (
    !state ||
    mode !== "game" ||
    dialog ||
    transitionBusy ||
    !$("overlay").hidden ||
    state.gameOver ||
    state.dawnCollapse?.active ||
    state.wakeUp?.active
  ) {
    return;
  }

  prepareSystems();

  const f =
    state.forgottenAlive;

  if (!f) return;

  f.ambientSilence =
    Math.max(
      0,
      f.ambientSilence - dt
    );

  if (v080ForgottenAliveActive()) {
    v080RegisterExplorationCell();
    v080TryAmbientTexture();

    if (
      f.westPresenceArmed &&
      state.room === "village" &&
      state.x <= 270
    ) {
      v080TriggerWestPresence();
      return;
    }
  }
};

function v080DrawForgottenAliveWorld() {
  const f =
    state?.forgottenAlive;

  if (!f) return;

  if (
    state.room === "northRoad" &&
    f.osmarStage >= 1
  ) {
    c.save();
    c.translate(
      -Math.floor(camera.x),
      -Math.floor(camera.y)
    );

    // Caixa de correio e pequena luz na casa de Osmar:
    // orientação visual sem criar HUD/checklist.
    rect(
      576,
      744,
      7,
      24,
      "#4a4338"
    );
    rect(
      570,
      739,
      20,
      10,
      "#6c6250"
    );
    rect(
      618,
      724,
      10,
      16,
      v080OsmarHomeNow()
        ? "#b69a63"
        : "#3c3933"
    );

    c.restore();
  }

  if (
    state.room === "village" &&
    f.brotherYardStage === 1
  ) {
    c.save();
    c.translate(
      -Math.floor(camera.x),
      -Math.floor(camera.y)
    );

    // Marca discreta no solo, visível apenas após o relato do irmão.
    rect(
      V080_YARD_TRACE_POS.x - 8,
      V080_YARD_TRACE_POS.y - 3,
      17,
      5,
      "#342f2a"
    );
    rect(
      V080_YARD_TRACE_POS.x + 4,
      V080_YARD_TRACE_POS.y - 6,
      5,
      3,
      "#151719"
    );

    c.restore();
  }

  if (
    state.room === "village" &&
    elapsed < v080WestPresenceUntil
  ) {
    c.save();
    c.translate(
      -Math.floor(camera.x),
      -Math.floor(camera.y)
    );

    const x = 125;
    const y = v080WestPresenceY;
    const jitter =
      Math.sin(elapsed * 48) * 2;

    rect(
      x - 14 + jitter,
      y - 32,
      27,
      19,
      "#020303"
    );
    rect(
      x - 21,
      y - 15,
      42,
      13,
      "#010202"
    );
    rect(
      x - 15,
      y - 3,
      8,
      17,
      "#010202"
    );
    rect(
      x + 7,
      y - 4,
      8,
      18,
      "#010202"
    );

    c.restore();
  }

  if (elapsed < v080WestStaticUntil) {
    const strength =
      Math.min(
        1,
        Math.max(
          v080WestStaticUntil - elapsed,
          0
        ) / 0.9
      );

    for (let i = 0; i < 30; i++) {
      const y =
        (
          i * 19 +
          Math.floor(elapsed * 720)
        ) % H;

      rect(
        -5,
        y,
        W + 10,
        1 + (i % 4 === 0 ? 2 : 0),
        "rgba(224,228,220," +
          (0.04 + strength * 0.14) +
          ")"
      );
    }
  }
}

const v080DrawBase = drawWorld;
drawWorld = function() {
  v080DrawBase();
  v080DrawForgottenAliveWorld();
};

const v080HudBase = updateHud;
updateHud = function() {
  v080HudBase();

  if (
    !state ||
    state.stage === "prologue"
  ) {
    return;
  }

  prepareSystems();

  const f =
    state.forgottenAlive;

  if (
    !f?.started ||
    f.westPresenceSeen ||
    state.storyFlags?.chapter4Complete
  ) {
    return;
  }

  // Primeiro fecha o que Raimundo acabou de apresentar.
  if (!state.storyFlags?.mineExteriorSeen) {
    $("objective").textContent =
      "Antes de voltar para a cidade, examine a entrada da antiga mina perto da estrada de Raimundo.";
    return;
  }

  if (f.brotherYardStage === 1) {
    $("objective").textContent =
      "Seu irmão viu alguma coisa no quintal. Examine a área perto do muro.";
    return;
  }

  if (
    state.room === "northRoad" &&
    f.osmarStage === 1 &&
    !f.completed.osmar
  ) {
    $("objective").textContent =
      "Florinda disse que Osmar mora nesta rua. Procure a casa com a caixa de correio velha.";
    return;
  }

  const count =
    v080FragmentCount();

  if (count === 0) {
    $("objective").textContent =
      "Continue investigando Forgotten. Volte a conversar com pessoas e observe as ruas.";
    return;
  }

  if (count === 1) {
    $("objective").textContent =
      "Uma nova informação não combina com o que você já sabia. Continue explorando Forgotten.";
    return;
  }

  if (count === 2) {
    $("objective").textContent =
      "As histórias estão começando a se cruzar. Procure mais uma informação antes de seguir adiante.";
    return;
  }

  if (f.westPresenceArmed) {
    $("objective").textContent =
      "As novas informações apontam para o lado oeste da cidade. Vá até a saída oeste do bairro.";
  }
};

// O diário mostra somente descobertas feitas.
// Não revela quantos Fragmentos faltam nem vira uma checklist.
const v080OpenJournalBase =
  openJournal;

openJournal = function() {
  v080OpenJournalBase();

  if (
    !state?.forgottenAlive?.started
  ) {
    return;
  }

  const root =
    $("modalText");

  if (!root) return;

  const notes = [];
  const f =
    state.forgottenAlive;

  if (f.completed.marketDrift) {
    notes.push(
      "O funcionário do mercado mudou a própria lembrança sobre a saída dos meus pais."
    );
  }

  if (f.completed.osmar) {
    notes.push(
      "Osmar viu um casal parecido com meus pais entrando no mercado, mas não viu quando saíram."
    );
  }

  if (f.completed.brotherYard) {
    notes.push(
      "Meu irmão viu algo no quintal. Encontrei uma marca funda no solo e um fio escuro preso no muro."
    );
  }

  if (f.completed.mineArchive) {
    notes.push(
      "Um arquivo digitalizado confirma um grande desabamento na mina de Forgotten há quase quarenta anos."
    );
  }

  if (f.westPresenceSeen) {
    notes.push(
      "Uma presença escura apareceu na direção da Rua Oeste e desapareceu quando tentei olhar diretamente."
    );
  }

  if (!notes.length) {
    return;
  }

  const title =
    document.createElement("strong");

  title.textContent =
    "FRAGMENTOS DE FORGOTTEN";

  title.style.display =
    "block";

  title.style.marginTop =
    "18px";

  root.append(title);

  const box =
    document.createElement("div");

  box.style.display =
    "grid";

  box.style.gap =
    "7px";

  box.style.marginTop =
    "10px";

  for (const note of notes) {
    const row =
      document.createElement("div");

    row.textContent =
      "• " + note;

    box.append(row);
  }

  root.append(box);
};

// Comando de teste focado na nova camada sem alterar a progressão normal.
const v080DevCommandBase =
  v0645RunDevCommand;

v0645RunDevCommand = function(raw) {
  const command =
    String(raw || "")
      .trim()
      .toLowerCase();

  if (command === "forgotten" || command === "viva") {
    prepareSystems();

    state.stage = "free";
    state.day = Math.max(
      3,
      state.day || 3
    );

    state.finished = true;
    state.storyFlags.marketParentsConfirmed = true;
    state.squareManFirstSpeechDone = true;
    state.storyFlags.squareObserverSeen = true;
    state.storyFlags.squareObserverReported = true;
    state.storyFlags.raimundoMet = true;
    state.storyFlags.mineExteriorSeen = true;
    state.storyFlags.observerFirstSeen = true;

    state.forgottenAlive.started = true;
    state.forgottenAlive.startedDay = state.day;
    state.forgottenAlive.westPresenceArmed = false;
    state.forgottenAlive.westPresenceSeen = false;
    state.forgottenAlive.completed.marketDrift = false;
    state.forgottenAlive.completed.osmar = false;
    state.forgottenAlive.completed.brotherYard = false;
    state.forgottenAlive.completed.mineArchive = false;
    if (state.phone) {
      state.phone.mineArchiveRead = false;
    }
    state.forgottenAlive.marketDriftStage = 0;
    state.forgottenAlive.osmarStage = 0;
    state.forgottenAlive.brotherYardStage = 0;
    state.forgottenAlive.mineNewspaperSeen = false;

    state.room = "village";
    state.x = 650;
    state.y = 760;
    state.facing = "up";
    state.walk = 0;

    keys.clear();
    near = null;

    updateHud();
    save();

    v06Toast(
      "TESTE: Forgotten Viva · pós-Raimundo",
      2.4
    );

    return;
  }

  v080DevCommandBase(raw);
};

// =========================================================
// 0.8.1 — CELULAR TIJOLÃO
// NOTAS + MENSAGENS + INTERNET RESIDENCIAL + COBRINHA
// =========================================================

const V081_CONNECTED_ROOMS = new Set([
  "bedroom",
  "brother",
  "parents",
  "hall",
  "foyer",
  "kitchen",
  "living",
  "attic",
  "basement",
  "shop"
]);

const V081_BROTHER_SCENES = {
  checkIn: {
    incoming:
      "Você vai demorar? Tá tudo quieto aqui, mas eu não gosto quando você some sem falar nada.",
    options: [
      {
        text: "Fica no quarto. Eu volto assim que terminar de olhar umas coisas.",
        reply: "Tá. Só me avisa quando estiver voltando.",
        care: 1,
        trust: 1
      },
      {
        text: "Se acontecer qualquer coisa, me manda mensagem na hora.",
        reply: "Eu mando. E você responde, tá?",
        care: 1,
        trust: 0
      },
      {
        text: "Tô ocupado. Para de se preocupar com tudo.",
        reply: "...Tá bom.",
        care: 0,
        trust: -1,
        neglect: 1
      }
    ]
  },

  yard: {
    incoming:
      "Acho que vi alguém no quintal. Foi rápido. Tinha uma coisa escura perto do muro.",
    options: [
      {
        text: "Não sai do quarto. Eu vou conferir quando voltar.",
        reply: "Tá. Eu tranquei a porta.",
        care: 1,
        trust: 1,
        yard: true
      },
      {
        text: "Olha pela janela só de longe. Não chega perto.",
        reply: "Eu olhei de novo e não vi mais nada. Vou ficar aqui.",
        care: 0,
        trust: 1,
        yard: true
      },
      {
        text: "Pode ter sido sombra. Mesmo assim, fica dentro de casa.",
        reply: "Eu sei o que eu vi... mas tá. Eu não vou sair.",
        care: 0,
        trust: -1,
        yard: true
      }
    ]
  },

  afterWest: {
    incoming:
      "Você tá bem? As luzes aqui piscaram e eu fiquei com a sensação de que tinha alguém olhando a casa.",
    options: [
      {
        text: "Tô bem. Se eu demorar, não abre a porta pra ninguém.",
        reply: "Nem se parecer com a mãe ou o pai?",
        care: 1,
        trust: 1
      },
      {
        text: "Continua no quarto. Eu achei uma coisa estranha do lado oeste.",
        reply: "Eu sabia que não era só coisa da minha cabeça.",
        care: 0,
        trust: 1
      },
      {
        text: "Não pensa nisso agora. Eu explico quando voltar.",
        reply: "Você sempre fala isso quando não quer me contar alguma coisa.",
        care: 0,
        trust: -1
      }
    ]
  }
};

let v081Snake = {
  active: false,
  timer: null,
  canvas: null,
  ctx: null,
  snake: [],
  food: { x: 12, y: 8 },
  dir: { x: 1, y: 0 },
  nextDir: { x: 1, y: 0 },
  score: 0,
  gameOver: false
};

function v081EnsurePhone() {
  if (!state) return;

  if (!state.phone || typeof state.phone !== "object") {
    state.phone = {};
  }

  const p =
    state.phone;

  if (!Array.isArray(p.pendingBrotherScenes)) {
    p.pendingBrotherScenes = [];
  }

  if (!Array.isArray(p.resolvedBrotherScenes)) {
    p.resolvedBrotherScenes = [];
  }

  if (!Array.isArray(p.brotherLog)) {
    p.brotherLog = [];
  }

  if (typeof p.activeBrotherScene !== "string") {
    p.activeBrotherScene = "";
  }

  if (!Number.isFinite(p.unreadBrother)) {
    p.unreadBrother = 0;
  }

  if (!Number.isFinite(p.parentAttempts)) {
    p.parentAttempts = 0;
  }

  if (!Number.isFinite(p.snakeHighScore)) {
    p.snakeHighScore = 0;
  }

  if (typeof p.mineArchiveRead !== "boolean") {
    p.mineArchiveRead = false;
  }

  if (typeof p.notificationShownFor !== "string") {
    p.notificationShownFor = "";
  }

  if (!state.forgottenAlive || typeof state.forgottenAlive !== "object") {
    return;
  }

  const f =
    state.forgottenAlive;

  if (!f.completed || typeof f.completed !== "object") {
    f.completed = {};
  }

  // Migração: quem encontrou o jornal antigo na 0.8.0 recebe a mesma
  // informação como arquivo digital já salvo no celular.
  const legacyMineClue =
    Boolean(
      f.completed.mineNewspaper ||
      f.mineNewspaperSeen
    );

  if (typeof f.completed.mineArchive !== "boolean") {
    f.completed.mineArchive =
      legacyMineClue;
  }

  if (legacyMineClue) {
    p.mineArchiveRead = true;
  }

  // O objeto antigo deixa de existir como interação no chão.
  f.mineNewspaperSeen = true;
}

const v081PrepareBase =
  prepareSystems;

prepareSystems = function() {
  v081PrepareBase();
  v081EnsurePhone();
};

// A pista da mina continua sendo um dos quatro Fragmentos possíveis,
// mas agora vem de um arquivo digital, não de um jornal abandonado.
v080FragmentCount = function() {
  const completed =
    state?.forgottenAlive?.completed || {};

  return [
    completed.marketDrift,
    completed.osmar,
    completed.brotherYard,
    completed.mineArchive
  ].filter(Boolean).length;
};

function v081HasInternet() {
  return Boolean(
    state &&
    V081_CONNECTED_ROOMS.has(state.room)
  );
}

function v081PhoneCanOpen() {
  if (
    !state ||
    mode !== "game" ||
    state.stage === "prologue" ||
    state.gameOver ||
    dialog ||
    transitionBusy ||
    !$("overlay").hidden ||
    state.dawnCollapse?.active ||
    state.wakeUp?.active
  ) {
    return false;
  }

  if (
    dangerActive() ||
    state.eventDirector?.hunter?.active ||
    state.eventDirector?.follower?.active ||
    state.copyFather?.phase === "chase"
  ) {
    return false;
  }

  return true;
}

function v081SignalLabel() {
  return v081HasInternet()
    ? "REDE ███"
    : "SEM REDE";
}

function v081PhoneTime() {
  const minutes =
    Math.max(
      0,
      Math.floor(state?.minutes || 0)
    );

  const h =
    Math.floor(minutes / 60) % 24;

  const m =
    minutes % 60;

  return (
    String(h).padStart(2, "0") +
    ":" +
    String(m).padStart(2, "0")
  );
}

function v081PhoneElement(tag, className, text) {
  const element =
    document.createElement(tag);

  if (className) {
    element.className =
      className;
  }

  if (text !== undefined) {
    element.textContent =
      text;
  }

  return element;
}

function v081ResetPhoneChrome() {
  const label =
    $("modalLabel");

  if (label) {
    label.textContent =
      "A QUINTA SOMBRA";
  }

  const overlay =
    $("overlay");

  if (overlay) {
    overlay.className = "";
  }

  const card =
    overlay?.querySelector(".card");

  if (card) {
    card.className =
      "card";
  }
}

function v081StopSnake() {
  if (v081Snake.timer) {
    clearInterval(
      v081Snake.timer
    );
  }

  v081Snake.timer = null;
  v081Snake.active = false;
  v081Snake.canvas = null;
  v081Snake.ctx = null;
}

const v081CloseModalBase =
  closeModal;

closeModal = function() {
  v081StopSnake();
  v081ResetPhoneChrome();
  v081CloseModalBase();
};

function v081PhoneModal(title, buildScreen, options = {}) {
  v081StopSnake();

  modal(
    "",
    "",
    []
  );

  $("modalLabel").textContent =
    "LANCASTER M-91";

  $("overlay").className =
    "phone-overlay";

  const card =
    $("overlay").querySelector(".card");

  card.className =
    "card phone-shell";

  $("modalTitle").textContent =
    title || "";

  const root =
    $("modalText");

  root.replaceChildren();

  const speaker =
    v081PhoneElement(
      "div",
      "phone-speaker",
      ""
    );

  const status =
    v081PhoneElement(
      "div",
      "phone-status"
    );

  const statusLeft =
    v081PhoneElement(
      "span",
      v081HasInternet()
        ? "phone-online"
        : "phone-offline",
      v081SignalLabel()
    );

  const statusRight =
    v081PhoneElement(
      "span",
      "",
      "DIA " +
        Math.max(1, state.day || 1) +
        " · " +
        v081PhoneTime()
    );

  status.append(
    statusLeft,
    statusRight
  );

  const screen =
    v081PhoneElement(
      "div",
      "phone-screen"
    );

  screen.append(status);

  buildScreen(screen);

  root.append(
    speaker,
    screen
  );

  const actions =
    $("modalActions");

  actions.replaceChildren();

  if (options.back) {
    const back =
      document.createElement("button");

    back.textContent =
      "VOLTAR";

    back.onclick =
      options.back;

    actions.append(back);
  }

  const close =
    document.createElement("button");

  close.textContent =
    "FECHAR";

  close.onclick =
    closeModal;

  actions.append(close);
}

function v081AppButton(label, sub, action, badge = "") {
  const button =
    document.createElement("button");

  button.className =
    "phone-app";

  const name =
    v081PhoneElement(
      "strong",
      "",
      label
    );

  const detail =
    v081PhoneElement(
      "span",
      "",
      sub
    );

  button.append(
    name,
    detail
  );

  if (badge) {
    const bubble =
      v081PhoneElement(
        "em",
        "phone-badge",
        badge
      );

    button.append(bubble);
  }

  button.onclick =
    action;

  return button;
}

function v081OpenPhoneHome() {
  const phoneAlreadyOpen =
    $("overlay").classList.contains("phone-overlay");

  if (
    !$("overlay").hidden &&
    !phoneAlreadyOpen
  ) {
    return;
  }

  // Também protege o atalho antigo J, que chama openJournal()
  // e agora é redirecionado para o celular.
  if (
    !phoneAlreadyOpen &&
    !v081PhoneCanOpen()
  ) {
    if (
      $("overlay").hidden &&
      !dialog &&
      !transitionBusy
    ) {
      v06Toast(
        "Não dá para mexer no celular agora.",
        1.8
      );
    }

    return;
  }

  prepareSystems();

  v081PhoneModal(
    "CELULAR",
    screen => {
      const welcome =
        v081PhoneElement(
          "div",
          "phone-home-title"
        );

      welcome.innerHTML =
        "<strong>M-91</strong><span>memória 12 MB</span>";

      const grid =
        v081PhoneElement(
          "div",
          "phone-app-grid"
        );

      const unread =
        state.phone.unreadBrother > 0
          ? String(state.phone.unreadBrother)
          : "";

      grid.append(
        v081AppButton(
          "MENSAGENS",
          v081HasInternet()
            ? "conectado"
            : "sem rede",
          v081OpenMessages,
          unread
        ),
        v081AppButton(
          "NOTAS",
          "investigação",
          v081OpenNotes
        ),
        v081AppButton(
          "INTERNET",
          v081HasInternet()
            ? "rede local"
            : "offline",
          v081OpenInternet
        ),
        v081AppButton(
          "COBRINHA",
          "jogo",
          v081OpenSnake
        )
      );

      const hint =
        v081PhoneElement(
          "p",
          "phone-small",
          "C fecha/abre o aparelho · aplicativos offline continuam funcionando sem rede."
        );

      screen.append(
        welcome,
        grid,
        hint
      );
    }
  );
}

function v081AppendNoteSection(screen, title, rows) {
  const section =
    v081PhoneElement(
      "section",
      "phone-note-section"
    );

  section.append(
    v081PhoneElement(
      "strong",
      "phone-section-title",
      title
    )
  );

  if (!rows.length) {
    section.append(
      v081PhoneElement(
        "p",
        "phone-empty",
        "Nenhum registro."
      )
    );
  } else {
    for (const rowText of rows) {
      section.append(
        v081PhoneElement(
          "p",
          "phone-note-row",
          "• " + rowText
        )
      );
    }
  }

  screen.append(section);
}

function v081OpenNotes() {
  prepareSystems();

  v081PhoneModal(
    "NOTAS",
    screen => {
      const q =
        chapter();

      const clues = [];

      for (const id of q?.clues || []) {
        if (!["list", "photo", "note"].includes(id)) {
          continue;
        }

        clues.push(
          v0645ClueName(id) +
          " — " +
          clueText[id]
        );
      }

      const log =
        typeof v0650EnsureInvestigationLog === "function"
          ? v0650EnsureInvestigationLog()
          : { contradictions: [] };

      const contradictions =
        (log.contradictions || []).map(id =>
          V0650_CONTRADICTION_LABELS?.[id] ||
          id
        );

      const fragments = [];
      const f =
        state.forgottenAlive;

      if (f?.completed?.marketDrift) {
        fragments.push(
          "O funcionário do mercado mudou a própria lembrança sobre a saída dos meus pais."
        );
      }

      if (f?.completed?.osmar) {
        fragments.push(
          "Osmar viu um casal parecido com meus pais entrando no mercado, mas não viu quando saíram."
        );
      }

      if (f?.completed?.brotherYard) {
        fragments.push(
          "Meu irmão viu algo no quintal. Encontrei uma marca funda no solo e um fio escuro preso no muro."
        );
      }

      if (f?.completed?.mineArchive) {
        fragments.push(
          "Um arquivo digitalizado confirma um grande desabamento na mina de Forgotten há quase quarenta anos."
        );
      }

      if (f?.westPresenceSeen) {
        fragments.push(
          "Uma presença escura apareceu na direção da Rua Oeste e desapareceu quando tentei olhar diretamente."
        );
      }

      v081AppendNoteSection(
        screen,
        "PISTAS",
        clues
      );

      v081AppendNoteSection(
        screen,
        "CONTRADIÇÕES",
        contradictions
      );

      v081AppendNoteSection(
        screen,
        "FORGOTTEN",
        fragments
      );
    },
    {
      back: v081OpenPhoneHome
    }
  );
}

function v081QueueBrotherScene(id) {
  prepareSystems();

  const p =
    state.phone;

  if (
    !V081_BROTHER_SCENES[id] ||
    p.resolvedBrotherScenes.includes(id) ||
    p.pendingBrotherScenes.includes(id) ||
    p.activeBrotherScene === id
  ) {
    return false;
  }

  p.pendingBrotherScenes.push(id);
  save();

  return true;
}

function v081DeliverBrotherScene() {
  prepareSystems();

  if (
    !v081HasInternet() ||
    state.phone.activeBrotherScene ||
    !state.phone.pendingBrotherScenes.length
  ) {
    return false;
  }

  const id =
    state.phone.pendingBrotherScenes.shift();

  const scene =
    V081_BROTHER_SCENES[id];

  if (!scene) {
    return false;
  }

  state.phone.activeBrotherScene =
    id;

  state.phone.unreadBrother += 1;

  state.phone.brotherLog.push({
    from: "brother",
    text: scene.incoming
  });

  if (
    state.phone.notificationShownFor !== id
  ) {
    state.phone.notificationShownFor =
      id;

    v06Toast(
      "Você tem uma nova mensagem.",
      2.6
    );
  }

  save();

  return true;
}

function v081ApplyBrotherReply(sceneId, optionIndex) {
  prepareSystems();

  const scene =
    V081_BROTHER_SCENES[sceneId];

  const option =
    scene?.options?.[optionIndex];

  if (
    !scene ||
    !option ||
    state.phone.activeBrotherScene !== sceneId
  ) {
    return;
  }

  state.phone.brotherLog.push({
    from: "you",
    text: option.text
  });

  state.phone.brotherLog.push({
    from: "brother",
    text: option.reply
  });

  state.phone.resolvedBrotherScenes.push(
    sceneId
  );

  state.phone.activeBrotherScene = "";
  state.phone.unreadBrother = 0;

  if (
    state.relationship &&
    typeof state.relationship === "object"
  ) {
    state.relationship.brotherCare +=
      option.care || 0;

    state.relationship.brotherTrust +=
      option.trust || 0;

    state.relationship.brotherNeglect +=
      option.neglect || 0;
  }

  if (
    option.yard &&
    state.forgottenAlive &&
    state.forgottenAlive.brotherYardStage === 0
  ) {
    state.forgottenAlive.brotherYardStage = 1;

    updateHud();
  }

  save();

  v081OpenBrotherThread();
}

function v081RenderMessageBubble(container, message) {
  const bubble =
    v081PhoneElement(
      "div",
      "phone-message " +
        (
          message.from === "you"
            ? "phone-message-you"
            : "phone-message-brother"
        ),
      message.text
    );

  container.append(bubble);
}

function v081OpenMessages() {
  prepareSystems();

  // Se uma mensagem ficou esperando sinal, ela entra assim que
  // o aplicativo é aberto dentro de uma residência.
  if (
    v081HasInternet() &&
    !state.phone.activeBrotherScene
  ) {
    v081DeliverBrotherScene();
  }

  v081PhoneModal(
    "MENSAGENS",
    screen => {
      const info =
        v081PhoneElement(
          "p",
          v081HasInternet()
            ? "phone-online-text"
            : "phone-offline-text",
          v081HasInternet()
            ? "Rede disponível nesta residência."
            : "Sem conexão. Mensagens novas chegam quando você entra em uma residência."
        );

      const list =
        v081PhoneElement(
          "div",
          "phone-contact-list"
        );

      const brother =
        document.createElement("button");

      brother.className =
        "phone-contact";

      brother.innerHTML =
        "<strong>IRMÃO</strong><span>" +
        (
          state.phone.unreadBrother > 0
            ? state.phone.unreadBrother + " nova"
            : "conversa"
        ) +
        "</span>";

      brother.onclick =
        v081OpenBrotherThread;

      const parents =
        document.createElement("button");

      parents.className =
        "phone-contact phone-contact-offline";

      parents.innerHTML =
        "<strong>PAIS</strong><span>SEM SINAL</span>";

      parents.onclick =
        v081OpenParentsThread;

      list.append(
        brother,
        parents
      );

      screen.append(
        info,
        list
      );
    },
    {
      back: v081OpenPhoneHome
    }
  );
}

function v081OpenBrotherThread() {
  prepareSystems();

  if (!v081HasInternet()) {
    v081PhoneModal(
      "IRMÃO",
      screen => {
        screen.append(
          v081PhoneElement(
            "div",
            "phone-no-signal",
            "SEM CONEXÃO\n\nEste contato volta a funcionar quando você entra em uma residência."
          )
        );
      },
      {
        back: v081OpenMessages
      }
    );

    return;
  }

  state.phone.unreadBrother = 0;

  const sceneId =
    state.phone.activeBrotherScene;

  const scene =
    V081_BROTHER_SCENES[sceneId];

  v081PhoneModal(
    "IRMÃO",
    screen => {
      const thread =
        v081PhoneElement(
          "div",
          "phone-thread"
        );

      const log =
        state.phone.brotherLog.slice(-12);

      if (!log.length) {
        thread.append(
          v081PhoneElement(
            "p",
            "phone-empty",
            "Nenhuma mensagem ainda."
          )
        );
      } else {
        for (const message of log) {
          v081RenderMessageBubble(
            thread,
            message
          );
        }
      }

      screen.append(thread);

      if (scene) {
        const choices =
          v081PhoneElement(
            "div",
            "phone-reply-list"
          );

        for (
          let i = 0;
          i < scene.options.length;
          i++
        ) {
          const option =
            scene.options[i];

          const button =
            document.createElement("button");

          button.className =
            "phone-reply";

          button.textContent =
            option.text;

          button.onclick =
            () =>
              v081ApplyBrotherReply(
                sceneId,
                i
              );

          choices.append(button);
        }

        screen.append(choices);
      }
    },
    {
      back: v081OpenMessages
    }
  );

  save();
}

function v081ParentAttempt(text) {
  prepareSystems();

  state.phone.parentAttempts += 1;

  state.phone.lastParentDraft =
    text;

  save();

  v081OpenParentsThread();
}

function v081OpenParentsThread() {
  prepareSystems();

  v081PhoneModal(
    "PAIS",
    screen => {
      const noSignal =
        v081PhoneElement(
          "div",
          "phone-no-signal",
          "SEM SINAL\n\nNão foi possível estabelecer conexão com este contato."
        );

      screen.append(noSignal);

      if (state.phone.lastParentDraft) {
        const failed =
          v081PhoneElement(
            "div",
            "phone-failed-message"
          );

        failed.append(
          v081PhoneElement(
            "span",
            "",
            state.phone.lastParentDraft
          ),
          v081PhoneElement(
            "strong",
            "",
            "FALHA AO ENVIAR"
          )
        );

        screen.append(failed);
      }

      const attempts =
        v081PhoneElement(
          "div",
          "phone-reply-list"
        );

      for (const draft of [
        "Onde vocês estão?",
        "Eu e meu irmão estamos em casa. Respondam.",
        "Por favor. Só manda qualquer coisa."
      ]) {
        const button =
          document.createElement("button");

        button.className =
          "phone-reply";

        button.textContent =
          draft;

        button.onclick =
          () =>
            v081ParentAttempt(draft);

        attempts.append(button);
      }

      screen.append(attempts);
    },
    {
      back: v081OpenMessages
    }
  );
}

function v081OpenInternet() {
  prepareSystems();

  if (!v081HasInternet()) {
    v081PhoneModal(
      "INTERNET",
      screen => {
        screen.append(
          v081PhoneElement(
            "div",
            "phone-no-signal",
            "SEM CONEXÃO\n\nA rede só funciona dentro de casa ou de outras residências."
          )
        );
      },
      {
        back: v081OpenPhoneHome
      }
    );

    return;
  }

  v081PhoneModal(
    "INTERNET",
    screen => {
      const title =
        v081PhoneElement(
          "div",
          "phone-browser-title",
          "PORTAL DE FORGOTTEN"
        );

      const list =
        v081PhoneElement(
          "div",
          "phone-browser-list"
        );

      if (
        state.storyFlags?.raimundoMet
      ) {
        const archive =
          document.createElement("button");

        archive.className =
          "phone-browser-result";

        archive.innerHTML =
          "<strong>Arquivo Municipal</strong>" +
          "<span>Acidente na antiga mina · documento digitalizado</span>";

        archive.onclick =
          v081OpenMineArchive;

        list.append(archive);
      } else {
        list.append(
          v081PhoneElement(
            "p",
            "phone-empty",
            "Nenhuma pesquisa importante salva."
          )
        );
      }

      screen.append(
        title,
        list
      );
    },
    {
      back: v081OpenPhoneHome
    }
  );
}

function v081OpenMineArchive() {
  prepareSystems();

  v081PhoneModal(
    "ARQUIVO MUNICIPAL",
    screen => {
      const article =
        v081PhoneElement(
          "article",
          "phone-archive"
        );

      const heading =
        v081PhoneElement(
          "strong",
          "",
          "DESABAMENTO NA MINA DE FORGOTTEN"
        );

      const body =
        v081PhoneElement(
          "p",
          "",
          "Cópia digitalizada de um jornal local de quase quarenta anos atrás. O texto registra um grande desabamento, turnos noturnos, galerias interditadas e famílias esperando notícias por vários dias. O nome dos Lancaster não aparece no documento."
        );

      const note =
        v081PhoneElement(
          "p",
          "phone-small",
          "O arquivo confirma que Raimundo não exagerou sobre a dimensão do acidente."
        );

      article.append(
        heading,
        body,
        note
      );

      screen.append(article);
    },
    {
      back: v081OpenInternet
    }
  );

  if (!state.phone.mineArchiveRead) {
    state.phone.mineArchiveRead = true;

    if (
      state.forgottenAlive &&
      state.storyFlags?.raimundoMet &&
      !state.forgottenAlive.westPresenceSeen
    ) {
      // v080CompleteFragment é quem marca completed.mineArchive.
      // Não marcamos antes, senão a função entenderia que já contou.
      v080CompleteFragment(
        "mineArchive",
        "Arquivo da mina"
      );
    } else if (state.forgottenAlive) {
      state.forgottenAlive.completed.mineArchive = true;
    }

    updateHud();
    save();
  }
}

function v081RandomFoodCell() {
  const occupied =
    new Set(
      v081Snake.snake.map(
        part =>
          part.x + "," + part.y
      )
    );

  let x = 0;
  let y = 0;

  do {
    x =
      Math.floor(Math.random() * 18);

    y =
      Math.floor(Math.random() * 18);
  } while (
    occupied.has(x + "," + y)
  );

  return { x, y };
}

function v081DrawSnake() {
  const game =
    v081Snake;

  if (!game.ctx || !game.canvas) {
    return;
  }

  const ctx =
    game.ctx;

  const size =
    game.canvas.width;

  const cell =
    size / 18;

  ctx.fillStyle =
    "#9cae75";

  ctx.fillRect(
    0,
    0,
    size,
    size
  );

  ctx.fillStyle =
    "rgba(23,32,24,0.12)";

  for (let i = 0; i < 18; i++) {
    ctx.fillRect(
      i * cell,
      0,
      1,
      size
    );

    ctx.fillRect(
      0,
      i * cell,
      size,
      1
    );
  }

  ctx.fillStyle =
    "#182219";

  for (const part of game.snake) {
    ctx.fillRect(
      part.x * cell + 1,
      part.y * cell + 1,
      cell - 2,
      cell - 2
    );
  }

  ctx.fillRect(
    game.food.x * cell + cell * 0.28,
    game.food.y * cell + cell * 0.28,
    cell * 0.44,
    cell * 0.44
  );

  ctx.font =
    "bold 12px monospace";

  ctx.fillText(
    "PONTOS " + game.score,
    6,
    14
  );

  if (game.gameOver) {
    ctx.fillStyle =
      "rgba(156,174,117,0.88)";

    ctx.fillRect(
      20,
      size / 2 - 28,
      size - 40,
      56
    );

    ctx.fillStyle =
      "#182219";

    ctx.textAlign =
      "center";

    ctx.font =
      "bold 16px monospace";

    ctx.fillText(
      "FIM DE JOGO",
      size / 2,
      size / 2 - 3
    );

    ctx.font =
      "11px monospace";

    ctx.fillText(
      "ENTER PARA RECOMEÇAR",
      size / 2,
      size / 2 + 16
    );

    ctx.textAlign =
      "left";
  }
}

function v081ResetSnake() {
  const center = 8;

  v081Snake.snake = [
    { x: center, y: 9 },
    { x: center - 1, y: 9 },
    { x: center - 2, y: 9 }
  ];

  v081Snake.dir =
    { x: 1, y: 0 };

  v081Snake.nextDir =
    { x: 1, y: 0 };

  v081Snake.score = 0;
  v081Snake.gameOver = false;
  v081Snake.food =
    v081RandomFoodCell();

  v081DrawSnake();
}

function v081SnakeStep() {
  if (
    !v081Snake.active ||
    v081Snake.gameOver
  ) {
    return;
  }

  v081Snake.dir = {
    ...v081Snake.nextDir
  };

  const head = {
    x:
      v081Snake.snake[0].x +
      v081Snake.dir.x,
    y:
      v081Snake.snake[0].y +
      v081Snake.dir.y
  };

  const hitWall =
    head.x < 0 ||
    head.y < 0 ||
    head.x >= 18 ||
    head.y >= 18;

  const hitSelf =
    v081Snake.snake.some(
      part =>
        part.x === head.x &&
        part.y === head.y
    );

  if (hitWall || hitSelf) {
    v081Snake.gameOver = true;

    state.phone.snakeHighScore =
      Math.max(
        state.phone.snakeHighScore,
        v081Snake.score
      );

    save();
    v081DrawSnake();
    return;
  }

  v081Snake.snake.unshift(
    head
  );

  if (
    head.x === v081Snake.food.x &&
    head.y === v081Snake.food.y
  ) {
    v081Snake.score += 1;
    v081Snake.food =
      v081RandomFoodCell();
  } else {
    v081Snake.snake.pop();
  }

  v081DrawSnake();
}

function v081SnakeDirection(x, y) {
  if (
    x === -v081Snake.dir.x &&
    y === -v081Snake.dir.y
  ) {
    return;
  }

  v081Snake.nextDir =
    { x, y };
}

function v081OpenSnake() {
  prepareSystems();

  v081PhoneModal(
    "COBRINHA",
    screen => {
      const stats =
        v081PhoneElement(
          "div",
          "phone-game-stats",
          "RECORDE " +
            state.phone.snakeHighScore
        );

      const canvas =
        document.createElement("canvas");

      canvas.width = 270;
      canvas.height = 270;
      canvas.className =
        "snake-canvas";

      const controls =
        v081PhoneElement(
          "div",
          "snake-controls"
        );

      const buttons = [
        ["▲", 0, -1, "snake-up"],
        ["◀", -1, 0, "snake-left"],
        ["▼", 0, 1, "snake-down"],
        ["▶", 1, 0, "snake-right"]
      ];

      for (const [label, x, y, cls] of buttons) {
        const button =
          document.createElement("button");

        button.textContent =
          label;

        button.className =
          cls;

        button.onclick =
          () =>
            v081SnakeDirection(x, y);

        controls.append(button);
      }

      screen.append(
        stats,
        canvas,
        controls,
        v081PhoneElement(
          "p",
          "phone-small",
          "Setas ou WASD · ENTER reinicia após perder."
        )
      );

      v081Snake.canvas =
        canvas;

      v081Snake.ctx =
        canvas.getContext("2d");

      v081Snake.active = true;

      v081ResetSnake();

      v081Snake.timer =
        setInterval(
          v081SnakeStep,
          135
        );
    },
    {
      back: v081OpenPhoneHome
    }
  );
}

function v081SnakeKeydown(event) {
  if (!v081Snake.active) {
    return;
  }

  const key =
    event.key.toLowerCase();

  const directions = {
    arrowup: [0, -1],
    w: [0, -1],
    arrowdown: [0, 1],
    s: [0, 1],
    arrowleft: [-1, 0],
    a: [-1, 0],
    arrowright: [1, 0],
    d: [1, 0]
  };

  if (directions[key]) {
    event.preventDefault();
    event.stopImmediatePropagation();

    v081SnakeDirection(
      directions[key][0],
      directions[key][1]
    );

    return;
  }

  if (
    key === "enter" &&
    v081Snake.gameOver
  ) {
    event.preventDefault();
    event.stopImmediatePropagation();

    v081ResetSnake();
    return;
  }

  if (key === "escape") {
    event.preventDefault();
    event.stopImmediatePropagation();

    v081OpenPhoneHome();
  }
}

window.addEventListener(
  "keydown",
  v081SnakeKeydown,
  true
);

function v081PhoneShortcut(event) {
  if (
    event.key.toLowerCase() !== "c" ||
    event.repeat ||
    mode !== "game"
  ) {
    return;
  }

  if (
    v081Snake.active
  ) {
    return;
  }

  if (
    $("overlay").classList.contains("phone-overlay")
  ) {
    event.preventDefault();
    event.stopImmediatePropagation();

    closeModal();
    return;
  }

  if (!v081PhoneCanOpen()) {
    if (
      $("overlay").hidden &&
      !dialog &&
      !transitionBusy
    ) {
      v06Toast(
        "Não dá para mexer no celular agora.",
        1.8
      );
    }

    return;
  }

  event.preventDefault();
  event.stopImmediatePropagation();

  v081OpenPhoneHome();
}

window.addEventListener(
  "keydown",
  v081PhoneShortcut,
  true
);

// Compatibilidade: o antigo atalho J também abre o aparelho,
// porque os listeners antigos chamam openJournal() dinamicamente.
openJournal =
  v081OpenPhoneHome;

function v081TryQueueMessages() {
  if (
    !state?.phone ||
    !state?.forgottenAlive?.started
  ) {
    return;
  }

  if (
    state.storyFlags?.raimundoMet &&
    !state.phone.resolvedBrotherScenes.includes("checkIn")
  ) {
    v081QueueBrotherScene(
      "checkIn"
    );
  }

  if (
    v080FragmentCount() >= 1 &&
    state.forgottenAlive.brotherYardStage === 0 &&
    state.phone.resolvedBrotherScenes.includes("checkIn") &&
    !state.phone.resolvedBrotherScenes.includes("yard")
  ) {
    v081QueueBrotherScene(
      "yard"
    );
  }

  if (
    state.forgottenAlive.westPresenceSeen &&
    !state.phone.resolvedBrotherScenes.includes("afterWest")
  ) {
    v081QueueBrotherScene(
      "afterWest"
    );
  }
}

const v081UpdateBase =
  update;

update = function(dt) {
  v081UpdateBase(dt);

  if (
    !state ||
    mode !== "game" ||
    dialog ||
    transitionBusy ||
    state.gameOver
  ) {
    return;
  }

  prepareSystems();

  v081TryQueueMessages();

  if (
    $("overlay").hidden &&
    v081HasInternet()
  ) {
    v081DeliverBrotherScene();
  }
};

// Ajuda final da 0.8.1: o diário deixa de ser uma interface separada.
$("help").onclick = () => modal(
  "Como jogar",
  "WASD / setas: andar. Shift/F: correr. E: interagir. I: inventário. C: celular. J também abre o celular por compatibilidade. L: ligar/desligar a lanterna. Esc: pausar. ESPAÇO: soco apenas contra ameaças físicas compatíveis.\\n\\nO celular funciona como registro de investigação. NOTAS e COBRINHA funcionam offline. INTERNET e mensagens com seu irmão só conectam dentro da sua casa ou de outras residências. O contato dos seus pais permanece sem sinal em qualquer lugar.\\n\\nAo jogar Cobrinha, o mundo fica pausado até você sair do aparelho.",
  [["Entendi", closeModal]]
);

// =========================================================
// 0.8.4 — CANVAS VISUAL PASS
// ILUMINAÇÃO, ATMOSFERA E PROFUNDIDADE GLOBAL
// =========================================================

const V084_OUTDOOR_ROOMS = new Set([
  "village",
  "northRoad",
  "squareRoad",
  "square",
  "oldRoad",
  "westRoad"
]);

function v084NightStrength() {
  if (!state) return 0;

  if (state.stage === "prologue") {
    return 0;
  }

  const m =
    ((state.minutes % 1440) + 1440) % 1440;

  if (m < 300) return 1;

  if (m < 420) {
    return 1 - (m - 300) / 120;
  }

  if (m < 1020) return 0;

  if (m < 1260) {
    return (m - 1020) / 240;
  }

  return 1;
}

function v084DrawScreenLight(x, y, radius, strength = 1) {
  const gradient =
    c.createRadialGradient(
      x,
      y,
      0,
      x,
      y,
      radius
    );

  gradient.addColorStop(
    0,
    "rgba(224,190,118," +
      (0.17 * strength) +
      ")"
  );

  gradient.addColorStop(
    0.35,
    "rgba(190,154,91," +
      (0.08 * strength) +
      ")"
  );

  gradient.addColorStop(
    1,
    "rgba(190,154,91,0)"
  );

  c.fillStyle = gradient;
  c.fillRect(
    x - radius,
    y - radius,
    radius * 2,
    radius * 2
  );
}

function v084WorldToScreen(x, y) {
  return {
    x: x - camera.x,
    y: y - camera.y
  };
}

function v084DrawStreetLightGlows() {
  if (
    !state ||
    !V084_OUTDOOR_ROOMS.has(state.room)
  ) {
    return;
  }

  const night =
    v084NightStrength();

  if (night <= 0.08) {
    return;
  }

  const sources = [];

  if (state.room === "village") {
    sources.push(
      [575, 330],
      [705, 520],
      [575, 690],
      [705, 900],
      [270, 475],
      [990, 475]
    );
  }

  if (state.room === "northRoad") {
    for (let y = 310; y < 1220; y += 210) {
      const left =
        Math.floor(y / 210) % 2 === 0;

      sources.push([
        left ? 312 : 575,
        y
      ]);
    }
  }

  if (state.room === "squareRoad") {
    sources.push(
      [240, 285],
      [610, 285],
      [960, 285],
      [240, 455],
      [610, 455],
      [960, 455]
    );
  }

  c.save();
  c.globalCompositeOperation =
    "screen";

  for (const [wx, wy] of sources) {
    const p =
      v084WorldToScreen(wx, wy);

    if (
      p.x < -100 ||
      p.y < -100 ||
      p.x > W + 100 ||
      p.y > H + 100
    ) {
      continue;
    }

    v084DrawScreenLight(
      p.x,
      p.y - 6,
      78,
      night
    );
  }

  c.restore();
}

function v084DrawFog() {
  if (
    !state ||
    !V084_OUTDOOR_ROOMS.has(state.room)
  ) {
    return;
  }

  const night =
    v084NightStrength();

  if (night < 0.28) {
    return;
  }

  c.save();

  for (let i = 0; i < 3; i++) {
    const drift =
      (
        elapsed * (5 + i * 2) +
        i * 180
      ) % (W + 260);

    const x =
      drift - 130;

    const y =
      H * (0.28 + i * 0.20) +
      Math.sin(elapsed * 0.12 + i) * 18;

    const gradient =
      c.createRadialGradient(
        x,
        y,
        8,
        x,
        y,
        145
      );

    gradient.addColorStop(
      0,
      "rgba(170,184,176," +
        (0.025 + night * 0.018) +
        ")"
    );

    gradient.addColorStop(
      1,
      "rgba(170,184,176,0)"
    );

    c.fillStyle = gradient;
    c.fillRect(
      x - 150,
      y - 70,
      300,
      140
    );
  }

  c.restore();
}

function v084DrawVignette() {
  const gradient =
    c.createRadialGradient(
      W / 2,
      H / 2,
      Math.min(W, H) * 0.20,
      W / 2,
      H / 2,
      Math.max(W, H) * 0.68
    );

  gradient.addColorStop(
    0,
    "rgba(0,0,0,0)"
  );

  gradient.addColorStop(
    0.68,
    "rgba(2,6,8,0.04)"
  );

  gradient.addColorStop(
    1,
    "rgba(1,4,6,0.24)"
  );

  c.fillStyle = gradient;
  c.fillRect(0, 0, W, H);
}

function v084DrawInteriorWarmth() {
  if (
    !state ||
    V084_OUTDOOR_ROOMS.has(state.room)
  ) {
    return;
  }

  const gradient =
    c.createRadialGradient(
      W * 0.52,
      H * 0.48,
      15,
      W * 0.52,
      H * 0.48,
      Math.max(W, H) * 0.62
    );

  gradient.addColorStop(
    0,
    "rgba(190,145,88,0.035)"
  );

  gradient.addColorStop(
    1,
    "rgba(8,16,20,0.08)"
  );

  c.fillStyle = gradient;
  c.fillRect(0, 0, W, H);
}

function v084DrawFineGrain() {
  const frame =
    Math.floor(elapsed * 4);

  c.save();

  for (let i = 0; i < 28; i++) {
    const x =
      Math.floor(
        hash(i + frame * 13, 91) * W
      );

    const y =
      Math.floor(
        hash(i + frame * 17, 47) * H
      );

    const alpha =
      0.018 +
      hash(i, frame + 3) * 0.018;

    c.fillStyle =
      "rgba(230,226,205," +
      alpha +
      ")";

    c.fillRect(
      x,
      y,
      1,
      1
    );
  }

  c.restore();
}

const v084DrawWorldBase =
  drawWorld;

drawWorld = function() {
  v084DrawWorldBase();

  if (
    !state ||
    mode !== "game" ||
    state.dawnCollapse?.active ||
    state.wakeUp?.active ||
    transitionBusy
  ) {
    return;
  }

  v084DrawStreetLightGlows();
  v084DrawFog();
  v084DrawInteriorWarmth();
  v084DrawVignette();
  v084DrawFineGrain();
};

// =========================================================
// 0.8.6 — NOITE 1 COM VIDA + CONTATOS SEPARADOS NO CELULAR
// =========================================================

function v086EnsureDay1Extras() {
  if (!state) return;

  if (
    !state.day1Extra ||
    typeof state.day1Extra !== "object"
  ) {
    state.day1Extra = {};
  }

  const e = state.day1Extra;

  for (const key of [
    "firstNotePrompted",
    "firstNoteSaved",
    "brotherBedtime",
    "tvChecked",
    "doorChecked",
    "doorLocked",
    "vanWitnessed"
  ]) {
    if (typeof e[key] !== "boolean") {
      e[key] = false;
    }
  }

  if (typeof e.brotherChoice !== "string") {
    e.brotherChoice = "";
  }

  if (typeof e.brotherLampOn !== "boolean") {
    e.brotherLampOn = true;
  }

  if (!Number.isFinite(e.doorLockedDay)) {
    e.doorLockedDay = -1;
  }

  if (!state.phone || typeof state.phone !== "object") {
    state.phone = {};
  }

  const p = state.phone;

  if (!Number.isFinite(p.motherAttempts)) {
    p.motherAttempts = 0;
  }

  if (!Number.isFinite(p.fatherAttempts)) {
    p.fatherAttempts = 0;
  }

  if (typeof p.lastMotherDraft !== "string") {
    p.lastMotherDraft = "";
  }

  if (typeof p.lastFatherDraft !== "string") {
    p.lastFatherDraft = "";
  }
}

const v086PrepareBase = prepareSystems;
prepareSystems = function() {
  v086PrepareBase();
  v086EnsureDay1Extras();
};

function v086AtHome() {
  return Boolean(
    state &&
    [
      "bedroom",
      "brother",
      "parents",
      "hall",
      "foyer",
      "kitchen",
      "living",
      "attic",
      "basement"
    ].includes(state.room)
  );
}

function v086Day1HomeDone() {
  const e = state?.day1Extra;

  return Boolean(
    e?.brotherBedtime &&
    e?.tvChecked &&
    e?.doorChecked
  );
}

// ---------------------------------------------------------
// VAN: só vira tópico se o jogador realmente estava na rua
// quando o acontecimento foi mostrado.
// ---------------------------------------------------------

const v086TriggerRandomBase =
  v0645TriggerRandomEvent;

v0645TriggerRandomEvent = function() {
  prepareSystems();

  const type =
    state?.randomEventState?.type;

  const witnessedVan =
    type === "van" &&
    state.room === "village" &&
    !dialog &&
    $("overlay").hidden;

  v086TriggerRandomBase();

  if (witnessedVan) {
    state.day1Extra.vanWitnessed = true;
    save();
  }
};

v0630OpenPoliceTopics = function() {
  prepareSystems();

  const buttons = [];

  buttons.push([
    "Falar dos pais",
    () => {
      closeModal();
      v0630PoliceParents();
    }
  ]);

  if (state.storyFlags?.squareObserverSeen) {
    buttons.push([
      state.storyFlags.squareObserverReported
        ? "Falar novamente do vulto"
        : "Falar do vulto preto",
      () => {
        closeModal();
        v077PoliceObserverReport();
      }
    ]);
  }

  if (state.storyEvents.oldManEncounters > 0) {
    buttons.push([
      "Falar do Raimundo",
      () => {
        closeModal();
        v0630PoliceOldMan();
      }
    ]);
  }

  const unreportedVan =
    state.storyEvents.vanSightings >
    state.policeReportedEvents.vanSightings;

  const vanCanBeReported =
    unreportedVan &&
    (
      state.day !== 1 ||
      state.day1Extra.vanWitnessed
    );

  if (vanCanBeReported) {
    buttons.push([
      "Falar da van",
      () => {
        closeModal();
        v0630PoliceVan();
      }
    ]);
  }

  if (state.chapter4?.bodySeen) {
    buttons.push([
      "Falar da rua oeste",
      () => {
        closeModal();
        v0649PoliceBody();
      }
    ]);
  }

  if (v0650Chapter5Unlocked()) {
    buttons.push([
      v0650HasContradiction("policeRecord")
        ? "Rever o registro estranho"
        : "Conferir um relatório",
      () => {
        closeModal();
        v0650PoliceContradiction();
      }
    ]);
  }

  if (
    state.sideQuests?.westCase?.garciaStatement ||
    state.sideQuests?.westCase?.evidenceFound
  ) {
    buttons.push([
      "Reabrir o caso da rua oeste",
      () => {
        closeModal();
        v070ResolveWestCase();
      }
    ]);
  }

  if (state.chapter8?.complete) {
    buttons.push([
      "Perguntar o que Anísio realmente pensa",
      () => {
        closeModal();
        v070PoliceInsight();
      }
    ]);
  }

  buttons.push(["Sair", closeModal]);

  modal(
    "Delegacia",
    "",
    buttons
  );
};

// ---------------------------------------------------------
// PEQUENAS AÇÕES DOMÉSTICAS DA PRIMEIRA NOITE
// ---------------------------------------------------------

if (
  maps.living &&
  !maps.living.objects.some(
    o => o.action === "day1TV"
  )
) {
  maps.living.objects.push(
    obj(
      58,
      58,
      88,
      48,
      "tv",
      "Ligar a televisão",
      "day1TV"
    )
  );
}

const v086FurnishingBase = furnishing;
furnishing = function(o) {
  if (o?.type === "tv") {
    const { x, y, w, h } = o;

    rect(
      x + 5,
      y + h - 1,
      w,
      7,
      "#0005"
    );

    rect(
      x,
      y,
      w,
      h,
      "#242827"
    );

    rect(
      x + 5,
      y + 5,
      w - 10,
      h - 13,
      "#0f1516"
    );

    const active =
      state?.day1Extra?.tvChecked &&
      state.day === 1;

    rect(
      x + 9,
      y + 9,
      w - 18,
      h - 21,
      active
        ? "#6d7f78"
        : "#182020"
    );

    if (active) {
      for (let i = 0; i < 5; i++) {
        rect(
          x + 12,
          y + 12 + i * 5,
          w - 24,
          1,
          i % 2
            ? "#bdc5ae33"
            : "#d5ddc644"
        );
      }
    }

    rect(
      x + w - 9,
      y + h - 8,
      3,
      3,
      "#b6a06c"
    );

    return;
  }

  if (
    o?.type === "lamp" &&
    state?.room === "brother" &&
    state?.day1Extra?.brotherBedtime
  ) {
    const { x, y, w } = o;
    const on =
      state.day1Extra.brotherLampOn;

    rect(
      x + w / 2 - 2,
      y + 8,
      4,
      21,
      "#322d27"
    );

    rect(
      x + w / 2 - 12,
      y + 3,
      24,
      12,
      on
        ? "#d2b36d"
        : "#5d5548"
    );

    if (on) {
      const glow =
        c.createRadialGradient(
          x + w / 2,
          y + 8,
          2,
          x + w / 2,
          y + 8,
          58
        );

      glow.addColorStop(
        0,
        "#eac0792f"
      );

      glow.addColorStop(
        1,
        "#eac07900"
      );

      c.fillStyle = glow;
      c.fillRect(
        x - 55,
        y - 55,
        150,
        150
      );
    }

    return;
  }

  v086FurnishingBase(o);
};

function v086FinishBrotherBedtime(lightOn) {
  prepareSystems();

  state.day1Extra.brotherLampOn =
    lightOn;

  state.day1Extra.brotherBedtime =
    true;

  save();
  updateHud();

  say([
    [
      "Irmão",
      lightOn
        ? "Deixa acesa só por hoje."
        : "Tá... boa noite."
    ],
    [
      "Você",
      "Se precisar de mim, manda mensagem. Eu estou em casa."
    ]
  ]);
}

function v086AskBrotherLamp() {
  modal(
    "Quarto do seu irmão",
    "Ele se ajeita na cama, mas ainda olha para a porta.",
    [
      [
        "Deixar a luz acesa",
        () => {
          closeModal();
          v086FinishBrotherBedtime(true);
        }
      ],
      [
        "Apagar a luz",
        () => {
          closeModal();
          v086FinishBrotherBedtime(false);
        }
      ]
    ]
  );
}

function v086BrotherNight1Choice() {
  prepareSystems();

  say(
    [
      ["Irmão", "A polícia achou eles?"],
      ["Você", "Ainda não."],
      ["Irmão", "Eles vão voltar, né?"]
    ],
    () => {
      modal(
        "O que dizer?",
        "",
        [
          [
            "“Eles só atrasaram. Vão voltar.”",
            () => {
              closeModal();

              state.day1Extra.brotherChoice =
                "reassure";

              if (state.relationship) {
                state.relationship.brotherCare += 1;
                state.relationship.brotherTrust += 0;
              }

              say(
                [
                  ["Você", "Eles só atrasaram. Vão voltar."],
                  ["Irmão", "Você promete?"],
                  ["Você", "...Eu vou ficar aqui com você."]
                ],
                v086AskBrotherLamp
              );
            }
          ],
          [
            "“Eu não sei. Mas eu tô aqui.”",
            () => {
              closeModal();

              state.day1Extra.brotherChoice =
                "honest";

              if (state.relationship) {
                state.relationship.brotherCare += 1;
                state.relationship.brotherTrust += 1;
              }

              say(
                [
                  ["Você", "Eu não sei. Mas eu tô aqui com você."],
                  ["Irmão", "Eu tô com medo."],
                  ["Você", "Eu também. A gente vai fazer isso junto."]
                ],
                v086AskBrotherLamp
              );
            }
          ],
          [
            "“A polícia está procurando. Tenta dormir.”",
            () => {
              closeModal();

              state.day1Extra.brotherChoice =
                "distant";

              if (state.relationship) {
                state.relationship.brotherNeglect += 1;
                state.relationship.brotherTrust -= 1;
              }

              say(
                [
                  ["Você", "A polícia está procurando. Tenta dormir."],
                  ["Irmão", "Tá..."],
                  ["Você", "Eu vou estar por perto."]
                ],
                v086AskBrotherLamp
              );
            }
          ]
        ]
      );
    }
  );
}

function v086WatchDay1TV() {
  prepareSystems();

  const e =
    state.day1Extra;

  if (
    state.day !== 1 ||
    !state.day1Progress?.completed
  ) {
    say([
      "Os canais locais passam reprises e notícias comuns. Nada fala dos meus pais."
    ]);
    return;
  }

  if (e.tvChecked) {
    say([
      "Nada mudou. Nenhuma notícia sobre meus pais."
    ]);
    return;
  }

  say(
    [
      "O telejornal local fala de uma obra na rodovia, do tempo e de um comércio assaltado em outra cidade.",
      "Nada sobre meus pais.",
      "É cedo demais. Lá fora, ninguém sabe que eles desapareceram."
    ],
    () => {
      e.tvChecked = true;
      save();
      updateHud();
    }
  );
}

function v086HandleFrontDoor() {
  prepareSystems();

  const e =
    state.day1Extra;

  if (!e.doorChecked) {
    modal(
      "Porta da frente",
      "Antes de tentar descansar, é melhor decidir o que fazer com a entrada.",
      [
        [
          "Trancar a porta",
          () => {
            closeModal();

            e.doorChecked = true;
            e.doorLocked = true;
            e.doorLockedDay = state.day;

            save();
            updateHud();

            say([
              "Você gira a chave e testa a maçaneta duas vezes.",
              "Pela primeira vez, trancar a casa parece uma responsabilidade sua."
            ]);
          }
        ],
        [
          "Sair de novo",
          () => {
            closeModal();
            v086InteractBase("outside");
          }
        ]
      ]
    );

    return;
  }

  if (e.doorLocked) {
    modal(
      "Porta da frente",
      "A porta está trancada por dentro.",
      [
        [
          "Destrancar e sair",
          () => {
            closeModal();
            e.doorLocked = false;
            save();
            v086InteractBase("outside");
          }
        ],
        [
          "Manter trancada",
          closeModal
        ]
      ]
    );

    return;
  }

  v086InteractBase("outside");
}

function v086PromptFirstPhoneNote() {
  prepareSystems();

  if (
    state.day1Extra.firstNotePrompted
  ) {
    return;
  }

  state.day1Extra.firstNotePrompted =
    true;
  save();

  modal(
    "Celular",
    "Essa pode ser importante. Anotar no celular?",
    [
      [
        "Anotar",
        () => {
          closeModal();

          state.day1Extra.firstNoteSaved =
            true;

          save();

          v06Toast(
            "Anotação salva no celular.",
            2
          );
        }
      ],
      [
        "Agora não",
        () => {
          closeModal();

          v06Toast(
            "Você pode revisar as pistas no app NOTAS.",
            2.2
          );
        }
      ]
    ]
  );
}

const v086InteractBase = interact;
interact = function(action) {
  prepareSystems();

  const clueAction =
    typeof action === "string" &&
    action.startsWith("clue:");

  const qBefore =
    clueAction
      ? chapter()
      : null;

  const clueCountBefore =
    Array.isArray(qBefore?.clues)
      ? qBefore.clues.length
      : -1;

  if (
    action === "day1TV"
  ) {
    v086WatchDay1TV();
    return;
  }

  if (
    action === "brother" &&
    state.day === 1 &&
    state.day1Progress?.completed &&
    !state.day1Extra.brotherBedtime &&
    !state.pendingBrotherRemark &&
    !dangerActive()
  ) {
    v086BrotherNight1Choice();
    return;
  }

  if (
    action === "outside" &&
    state.room === "foyer" &&
    state.day === 1 &&
    state.day1Progress?.completed
  ) {
    v086HandleFrontDoor();
    return;
  }

  v086InteractBase(action);

  if (
    clueAction &&
    state.day === 1 &&
    !state.firstExit &&
    !state.day1Extra.firstNotePrompted
  ) {
    const qAfter =
      chapter();

    const clueCountAfter =
      Array.isArray(qAfter?.clues)
        ? qAfter.clues.length
        : clueCountBefore;

    if (
      clueCountAfter >
      clueCountBefore
    ) {
      v086PromptFirstPhoneNote();
    }
  }
};

// ---------------------------------------------------------
// SONO: na Noite 1, antes de dormir, fecha o pequeno ritual
// doméstico. Depois disso continua valendo a regra das 03:00.
// ---------------------------------------------------------

const v086SleepAvailableBase =
  v079NightSleepAvailable;

v079NightSleepAvailable = function() {
  if (
    state?.day === 1 &&
    state.day1Progress?.completed &&
    !v086Day1HomeDone()
  ) {
    return false;
  }

  return v086SleepAvailableBase();
};

const v086SleepBlockedBase =
  v079SleepBlockedReason;

v079SleepBlockedReason = function() {
  if (
    state?.day === 1 &&
    state.day1Progress?.completed &&
    !v086Day1HomeDone()
  ) {
    return "Antes de dormir, preciso ver meu irmão e deixar a casa em ordem.";
  }

  return v086SleepBlockedBase();
};

// ---------------------------------------------------------
// CELULAR: MÃE e PAI separados.
// ---------------------------------------------------------

function v086ParentAttempt(contact, text) {
  prepareSystems();

  if (contact === "mother") {
    state.phone.motherAttempts += 1;
    state.phone.lastMotherDraft = text;
    save();
    v086OpenMotherThread();
    return;
  }

  state.phone.fatherAttempts += 1;
  state.phone.lastFatherDraft = text;
  save();
  v086OpenFatherThread();
}

function v086BuildParentThread(
  title,
  status,
  detail,
  lastDraft,
  contact
) {
  v081PhoneModal(
    title,
    screen => {
      screen.append(
        v081PhoneElement(
          "div",
          "phone-no-signal",
          status +
            "\n\n" +
            detail
        )
      );

      if (lastDraft) {
        const failed =
          v081PhoneElement(
            "div",
            "phone-failed-message"
          );

        failed.append(
          v081PhoneElement(
            "span",
            "",
            lastDraft
          ),
          v081PhoneElement(
            "strong",
            "",
            "FALHA AO ENVIAR"
          )
        );

        screen.append(failed);
      }

      const attempts =
        v081PhoneElement(
          "div",
          "phone-reply-list"
        );

      const drafts =
        contact === "mother"
          ? [
              "Mãe, onde você está?",
              "Eu e ele estamos em casa. Responde.",
              "Por favor, manda qualquer coisa."
            ]
          : [
              "Pai, onde você está?",
              "Seu telefone está fora de área. Me responde.",
              "Pai, a gente tá esperando vocês."
            ];

      for (const draft of drafts) {
        const button =
          document.createElement("button");

        button.className =
          "phone-reply";

        button.textContent =
          draft;

        button.onclick =
          () =>
            v086ParentAttempt(
              contact,
              draft
            );

        attempts.append(button);
      }

      screen.append(attempts);
    },
    {
      back: v081OpenMessages
    }
  );
}

function v086OpenMotherThread() {
  prepareSystems();

  v086BuildParentThread(
    "MÃE",
    "SEM SINAL",
    "Não foi possível estabelecer conexão com este contato.",
    state.phone.lastMotherDraft,
    "mother"
  );
}

function v086OpenFatherThread() {
  prepareSystems();

  v086BuildParentThread(
    "PAI",
    "FORA DE ÁREA",
    "O aparelho chamado está fora da área de cobertura ou desligado.",
    state.phone.lastFatherDraft,
    "father"
  );
}

// Compatibilidade com código antigo que ainda possa abrir PAIS.
v081OpenParentsThread =
  v086OpenMotherThread;

v081OpenMessages = function() {
  prepareSystems();

  if (
    v081HasInternet() &&
    !state.phone.activeBrotherScene
  ) {
    v081DeliverBrotherScene();
  }

  v081PhoneModal(
    "MENSAGENS",
    screen => {
      const info =
        v081PhoneElement(
          "p",
          v081HasInternet()
            ? "phone-online-text"
            : "phone-offline-text",
          v081HasInternet()
            ? "Rede disponível nesta residência."
            : "Sem conexão. Mensagens novas chegam quando você entra em uma residência."
        );

      const list =
        v081PhoneElement(
          "div",
          "phone-contact-list"
        );

      const brother =
        document.createElement("button");

      brother.className =
        "phone-contact";

      brother.innerHTML =
        "<strong>IRMÃO</strong><span>" +
        (
          state.phone.unreadBrother > 0
            ? state.phone.unreadBrother +
              " nova"
            : "conversa"
        ) +
        "</span>";

      brother.onclick =
        v081OpenBrotherThread;

      const mother =
        document.createElement("button");

      mother.className =
        "phone-contact phone-contact-offline";

      mother.innerHTML =
        "<strong>MÃE</strong><span>SEM SINAL</span>";

      mother.onclick =
        v086OpenMotherThread;

      const father =
        document.createElement("button");

      father.className =
        "phone-contact phone-contact-offline";

      father.innerHTML =
        "<strong>PAI</strong><span>FORA DE ÁREA</span>";

      father.onclick =
        v086OpenFatherThread;

      list.append(
        brother,
        mother,
        father
      );

      screen.append(
        info,
        list
      );
    },
    {
      back: v081OpenPhoneHome
    }
  );
};

// ---------------------------------------------------------
// HUD DA NOITE 1: sem "ande até amanhecer" sem conteúdo.
// ---------------------------------------------------------

const v086HudBase = updateHud;
updateHud = function() {
  v086HudBase();

  if (
    !state ||
    state.stage === "prologue" ||
    state.day !== 1 ||
    !state.day1Progress?.completed
  ) {
    return;
  }

  prepareSystems();

  if (!v086AtHome()) {
    $("objective").textContent =
      "Você já fez o que podia na rua. Volte para casa e veja seu irmão.";
    return;
  }

  if (!state.day1Extra.brotherBedtime) {
    $("objective").textContent =
      "Vá ao quarto do seu irmão e veja como ele está.";
    return;
  }

  if (!state.day1Extra.tvChecked) {
    $("objective").textContent =
      "Veja se há alguma notícia na televisão da sala.";
    return;
  }

  if (!state.day1Extra.doorChecked) {
    $("objective").textContent =
      "Confira e tranque a porta da frente antes de descansar.";
    return;
  }

  if (state.minutes < 180) {
    $("objective").textContent =
      "Você fez o que podia por agora. Fique em casa; depois das 03:00, pode dormir.";
    return;
  }

  if (state.minutes < 420) {
    $("objective").textContent =
      "Você fez o que podia por agora. Vá para o seu quarto e durma.";
  }
};

$("version").textContent = "PROTÓTIPO · 0.8.6";
  
  requestAnimationFrame(frame);
  showBootSplash();
})();


