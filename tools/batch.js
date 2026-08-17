#!/usr/bin/env node
// tools/batch.js — the art production run.
//
// Batched, with a spend ceiling in front of every paid call and a per-class contact sheet at the
// end. Generation is a BUILD INPUT: raw output lands in assets/raw/ (gitignored) and only the
// palette-quantised result is committed.
//
// Resumable by design: anything already on disk is skipped, so a killed run costs nothing but the
// asset it was mid-way through.

const fs = require('fs');
const path = require('path');
const meshy = require('./meshy.js');
const spend = require('./spend.js');
const png = require('./png.js');

const ROOT = path.resolve(__dirname, '..');
const RAW = path.join(ROOT, 'assets', 'raw');
const SPRITES = path.join(ROOT, 'assets', 'sprites');
const TEX = path.join(ROOT, 'assets', 'tex');

// One fixed clause per class, appended to the shared style preamble. Consistency across hundreds
// of assets comes from these being IDENTICAL every time, never re-described per asset.
const CREATURE_STYLE =
  ' Low-poly game character, clean readable silhouette, standing in a T-pose, ' +
  'no base, no ground plane, no scenery, single character only.';

// 21 monsters + NPC kinds. Prompts are deliberately silhouette-first: what must read at 40px tall.
const CREATURES = {
  rat:         'A giant sewer rat the size of a dog, matted brown fur, long naked tail, hunched on four legs, yellow incisors',
  goblin:      'A hunched goblin warrior, green-grey skin, long pointed ears, leather scraps, rusted iron cleaver',
  goblin_arch: 'A wiry goblin archer, green skin, short bow across its back, quiver, ragged hood',
  wolf:        'A lean grey wolf, thick shoulder ruff, head low, bared teeth, bushy tail',
  bandit:      'A human bandit in a hooded leather jerkin, cloth face wrap, short sword, worn boots',
  bandit_capt: 'A bandit captain in studded leather and a red sash, plumed hat, curved sabre, scarred face',
  skeleton:    'An animated skeleton warrior, bare yellowed bone, rusted iron helm, notched shortsword, empty eye sockets',
  zombie:      'A shambling zombie, grey rotted flesh, torn peasant clothes, one arm hanging, slack jaw',
  ghoul:       'A crouching ghoul, grey hairless skin drawn tight over ribs, long clawed fingers, wide lipless mouth',
  wraith:      'A hooded wraith, tattered dark robes, no visible face, skeletal hands, trailing ragged hem',
  spider:      'A giant cave spider, eight long segmented legs, bulbous dark abdomen, cluster of eyes, fangs',
  kobold:      'A small kobold miner, reddish scaled skin, snout and horns, leather apron, pickaxe',
  kobold_sham: 'A kobold shaman, scaled skin, bone headdress with feathers, staff topped with a skull, beaded robe',
  ogre:        'A hulking ogre, thick grey-brown hide, enormous shoulders, small head, huge wooden club, loincloth',
  troll:       'A gaunt marsh troll, mottled green rubbery skin, long arms to the ground, hooked claws, drooping features',
  harpy:       'A harpy, woman-headed bird creature, ragged brown feathered wings, taloned feet, wild hair',
  elemental:   'An elemental of burning ash and cinders, roughly humanoid, cracked glowing core, no face, smoke wisps',
  knight_ash:  'An armoured undead knight in blackened dented plate, closed visor, tattered surcoat, greatsword',
  lich:        'A lich in decayed archmage robes, skull face, circlet of iron, bony hands raised, staff',
  ash_crown:   'A towering armoured wraith-king wearing a jagged blackened iron crown, ash-grey cloak, enormous dark blade',
  npc_captain: 'A town guard captain in chainmail and a blue tabard, helmet under one arm, sword at hip',
  npc_foreman: 'A mine foreman in a leather coat and flat cap, lantern in hand, thick beard',
  npc_smith:   'A blacksmith in a heavy leather apron, bare muscled arms, hammer, soot-streaked',
  npc_priest:  'A priest in pale robes with a hood and a simple pendant, hands clasped',
  npc_archivist: 'An old archivist in dark scholarly robes, spectacles, an armful of scrolls',
  npc_hunter:  'A hunter in green and brown leathers, longbow, fur-trimmed cloak, hood down',
  npc_herbalist: 'An herbalist woman in a patched shawl, basket of cut herbs, grey hair tied back',
};

const PROPS = {
  oak:        'A broad oak tree with a thick trunk and dense rounded canopy, summer foliage',
  pine:       'A tall conifer pine tree, layered branches, dark green needles, straight trunk',
  deadtree:   'A dead bare tree, cracked grey bark, twisted leafless branches',
  rock:       'A weathered grey granite boulder, lichen patches, angular faces',
  standingstone: 'An ancient standing stone monolith, weathered grey granite, carved spiral runes',
  brazier:    'An iron brazier on a tripod filled with burning coals, small flames',
  fountain:   'A round carved stone fountain basin with a central pillar spout',
  chest:      'A banded wooden treasure chest with iron straps and a heavy lock, closed',
  sign:       'A wooden hanging shop sign on an iron bracket post, blank board',
  tent:       'A canvas camp tent, weathered cream fabric, rope guys, wooden poles',
  bush:       'A dense low shrub with small dark green leaves',
  reed:       'A clump of tall marsh reeds and cattails',
  stump:      'A cut tree stump with visible growth rings and rough bark',
  ashstump:   'A charred burnt tree stump, blackened cracked wood, ash at the base',
};

// Tileable surfaces. "Orthographic flat-on, evenly lit, no perspective" is what makes them tile.
const TEXTURES = {
  stonewall:  'Seamless tiling stone wall texture: weathered grey granite ashlar blocks in regular courses, deep mortar joints, chipped edges',
  brickwall:  'Seamless tiling brick wall texture: red-brown fired clay bricks in running bond, pale mortar, worn faces',
  timberwall: 'Seamless tiling timber wall texture: vertical weathered oak planks, visible grain, iron nail heads, narrow gaps',
  plaster:    'Seamless tiling lime plaster wall texture: cream render over stone, hairline cracks, patchy discolouration',
  cliff:      'Seamless tiling rock cliff face texture: fractured grey stone, angular strata, loose scree, deep shadow crevices',
  marble:     'Seamless tiling polished marble texture: pale grey-white stone with fine dark veining, square slabs',
  obsidian:   'Seamless tiling black volcanic rock texture: glassy dark obsidian, conchoidal fractures, dull red heat in the cracks',
  ice:        'Seamless tiling glacier ice texture: pale blue-white ice, internal fractures, frost bloom',
  grass:      'Seamless tiling meadow grass texture seen from directly above: mixed green blades, small clover, patches of earth',
  moss:       'Seamless tiling forest floor texture from above: deep green moss, scattered brown leaf litter, small twigs',
  dirt:       'Seamless tiling bare earth texture from above: packed brown soil, small stones, cart rut grooves',
  road:       'Seamless tiling dirt road texture from above: compacted pale earth, wheel ruts, scattered gravel',
  gravel:     'Seamless tiling gravel texture from above: loose grey crushed stone chips of mixed size',
  sand:       'Seamless tiling beach sand texture from above: fine pale golden sand, gentle ripples, a few shell fragments',
  snow:       'Seamless tiling snow texture from above: clean wind-packed white snow, soft drift ridges',
  marsh:      'Seamless tiling marsh ground texture from above: dark waterlogged peat, sedge tufts, shallow standing water',
  ash:        'Seamless tiling volcanic ash texture from above: fine grey ash, black cinders, faint ember glow in cracks',
  water:      'Seamless tiling shallow water texture from above: dark blue-green water with gentle surface ripples',
  plaza:      'Seamless tiling town square paving texture from above: fitted grey flagstones of irregular size, worn smooth, grass in the joints',
  tile:       'Seamless tiling crypt floor texture from above: square dark stone tiles, cracked, dust in the joints',
  wood:       'Seamless tiling wooden floorboard texture from above: wide oak planks, visible grain and joints',
  rock:       'Seamless tiling bare rock ground texture from above: grey stone slabs, cracks, patches of grit',
};

function log(...a) {
  const line = a.join(' ');
  fs.appendFileSync(path.join(ROOT, 'assets', 'raw', 'batch.log'), line + '\n');
  console.log(line);
}

async function doCreature(id, prompt) {
  const glb = path.join(RAW, 'meshy', id + '.glb');
  if (fs.existsSync(glb)) { log('  skip mesh (exists) ' + id); return glb; }

  const pid = await meshy.createPreview(prompt + CREATURE_STYLE, { target_polycount: 6000, pose_mode: 't-pose' });
  await meshy.waitFor(pid);
  const rid = await meshy.createRefine(pid);
  const t = await meshy.waitFor(rid);
  if (!t.model_urls || !t.model_urls.glb) throw new Error(id + ': no glb in result');
  const n = await meshy.download(t.model_urls.glb, glb);
  log('  mesh ' + id + '  ' + (n / 1024 | 0) + ' KB');
  return glb;
}

async function doTexture(id, prompt) {
  const out = path.join(RAW, 'img', 'tex_' + id + '.png');
  if (fs.existsSync(out)) { log('  skip image (exists) ' + id); return out; }
  const r = await meshy.image(
    prompt + ' Orthographic flat-on view, evenly lit, no perspective, no vignette, no cast shadows, tileable.',
    { body: { ai_model: 'gpt-image-2', aspect_ratio: '1:1' } });
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, r.images[0]);
  log('  image ' + id + '  ' + (r.images[0].length / 1024 | 0) + ' KB  ' + r.credits + 'cr');
  return out;
}

async function main() {
  const what = process.argv[2] || 'all';
  fs.mkdirSync(path.join(RAW), { recursive: true });
  fs.mkdirSync(path.join(RAW, 'meshy'), { recursive: true });
  fs.mkdirSync(path.join(RAW, 'img'), { recursive: true });

  log('=== batch ' + what + ' — cap ' + spend.cap() + ', spent ' + spend.spent() + ' ===');

  if (what === 'textures' || what === 'all') {
    log('-- textures (' + Object.keys(TEXTURES).length + ') --');
    for (const id of Object.keys(TEXTURES)) {
      try { await doTexture(id, TEXTURES[id]); }
      catch (e) { log('  FAIL tex ' + id + ': ' + e.message.split('\n')[0]); if (/SPEND CAP/.test(e.message)) return; }
    }
  }

  if (what === 'creatures' || what === 'all') {
    log('-- creatures (' + Object.keys(CREATURES).length + ') --');
    for (const id of Object.keys(CREATURES)) {
      try { await doCreature(id, CREATURES[id]); }
      catch (e) { log('  FAIL mesh ' + id + ': ' + e.message.split('\n')[0]); if (/SPEND CAP/.test(e.message)) return; }
    }
  }

  if (what === 'props' || what === 'all') {
    log('-- props (' + Object.keys(PROPS).length + ') --');
    for (const id of Object.keys(PROPS)) {
      try { await doCreature(id, PROPS[id] + ' Single object, no ground plane, no scenery.'); }
      catch (e) { log('  FAIL prop ' + id + ': ' + e.message.split('\n')[0]); if (/SPEND CAP/.test(e.message)) return; }
    }
  }

  log('=== batch done — spent ' + spend.spent() + ' of ' + spend.cap() + ' ===');
}

module.exports = { CREATURES, PROPS, TEXTURES };

if (require.main === module) {
  main().catch((e) => { log('BATCH FAILED: ' + e.message); process.exit(1); });
}
