// Hand-picked, well-known browser games. Each is checked like the harvested ones.
// Usage: node tools/curated.mjs <out.json>   (same format as harvest.json; feed it to verify.mjs)
import { writeFileSync } from 'node:fs';
import { check } from './lib-check.mjs';

// [title, page url, creator, genre, repo (owner/name) or '', license, description]
// Titles that are reverse-engineered or re-implemented games (they get the "Reverse-engineered" tag).
const REVERSE = new Set(['PokéRogue', 'Pokémon Showdown', 'ClassiCube', 'BananaBread', 'OpenFront.io', 'Freeciv-web']);
const LIST = [
  ['ClassiCube', 'https://www.classicube.net/', 'UnknownShadow200', 'Sandbox', 'ClassiCube/ClassiCube', 'BSD-3-Clause', 'A from-scratch re-creation of Minecraft Classic. Free, with its own assets.'],
  ['BananaBread', 'https://kripken.github.io/BananaBread/cube2/index.html', 'Alon Zakai', 'Shooter', 'kripken/BananaBread', 'zlib', 'Cube 2 (Sauerbraten) compiled to the browser with free game content.'],
  ['OpenFront.io', 'https://openfront.io/', 'OpenFront', 'Strategy', 'openfrontio/OpenFrontIO', 'AGPL-3.0', 'Open-source browser strategy game of territory and alliances.'],
  ['Hextris', 'https://hextris.github.io/hextris/', 'Hextris team', 'Puzzle', 'Hextris/hextris', 'GPL-3.0', 'Fast-paced puzzle game inspired by Tetris.'],
  ['A Dark Room', 'https://adarkroom.doublespeakgames.com/', 'Doublespeak Games', 'Adventure', 'doublespeakgames/adarkroom', 'MPL-2.0', 'A minimalist text adventure that slowly grows into something else.'],
  ['Pokémon Showdown', 'https://play.pokemonshowdown.com/', 'Smogon', 'Strategy', 'smogon/pokemon-showdown-client', 'AGPL-3.0', 'Fan-made Pokémon battle simulator. Free, no account needed to start.'],
  ['PokéRogue', 'https://pokerogue.net/', 'pagefaultgames', 'RPG', 'pagefaultgames/pokerogue', 'AGPL-3.0', 'Fan-made Pokémon roguelite that runs in the browser.'],
  ['Sandspiel', 'https://sandspiel.club/', 'Max Bittker', 'Sandbox', 'MaxBittker/sandspiel', 'MIT', 'A falling-sand toy. Mix water, fire, plants, and more.'],
  ['HexGL', 'https://hexgl.bkcore.com/play/', 'Thibaut Despoulain', 'Racing', 'BKcore/HexGL', 'MIT', 'A futuristic racing game built with WebGL.'],
  ['Javascript Racer', 'https://jakesgordon.github.io/javascript-racer/', 'Jake Gordon', 'Racing', 'jakesgordon/javascript-racer', 'MIT', 'A pseudo-3D arcade racer in plain JavaScript.'],
  ['Jstris', 'https://jstris.jezevec10.com/', 'Jezevec10', 'Puzzle', '', '', 'Fast, free Tetris-style falling-block game with online modes.'],
  ['Chrome Dino', 'https://chromedino.com/', 'Chrome Dino fans', 'Platformer', '', '', 'The offline dinosaur runner.'],
  ['Freeciv-web', 'https://www.freecivweb.org/', 'Freeciv', 'Strategy', 'freeciv/freeciv-web', 'AGPL-3.0', 'Turn-based civilization strategy in the browser.'],
  ['Trust (The Evolution of Trust)', 'https://ncase.me/trust/', 'Nicky Case', 'Simulation', 'ncase/trust', 'CC0-1.0', 'An interactive guide to why people trust each other.'],
  ['Parable of the Polygons', 'https://ncase.me/polygons/', 'Vi Hart & Nicky Case', 'Simulation', 'ncase/polygons', 'CC0-1.0', 'A playable explanation of how small biases build segregation.'],
  ['Cookie Clicker', 'https://orteil.dashnet.org/cookieclicker/', 'Orteil', 'Idle', '', '', 'The classic incremental game about baking cookies.'],
  ['Slow Roads', 'https://slowroads.io/', 'Anslo', 'Racing', '', '', 'A calm, endless driving game.'],
  ['2048', 'https://play2048.co/', 'Gabriele Cirulli', 'Puzzle', 'gabrielecirulli/2048', 'MIT', 'Join the numbers and get to the 2048 tile.'],
  ['Flappy Bird (open source clone)', 'https://nebezb.com/floppybird/', 'Nebez Briefkani', 'Arcade', 'nebez/floppybird', 'Apache-2.0', 'A faithful HTML5 Flappy Bird clone.'],
  ['Clumsy Bird', 'https://ellisonleao.github.io/clumsy-bird/', 'Ellison Leão', 'Arcade', 'ellisonleao/clumsy-bird', 'MIT', 'A Flappy Bird clone built with melonJS.'],
  ['Pacman Canvas', 'https://www.shaunlebron.com/pacman/', 'Shaun Williams', 'Arcade', 'shaunlebron/pacman', '', 'A Pac-Man clone with a behavior guide.'],
  ['Tetris (Chvin)', 'https://chvin.github.io/react-tetris/', 'chvin', 'Puzzle', 'chvin/react-tetris', 'MIT', 'Tetris built with React and Redux.'],
  ['Bruno Simon', 'https://bruno-simon.com/', 'Bruno Simon', 'Racing', 'brunosimon/folio-2019', '', 'Drive a toy car around a 3D portfolio.'],
  ['Little Alchemy 2', 'https://littlealchemy2.com/', 'Recloak', 'Puzzle', '', '', 'Combine elements to discover new ones.'],
  ['Tetr.io', 'https://tetr.io/', 'osk', 'Puzzle', '', '', 'Competitive falling-block game.'],
  ['Lichess (play)', 'https://lichess.org/', 'Lichess', 'Card & Board', 'lichess-org/lila', 'AGPL-3.0', 'Free, open-source chess.'],
];

const out = [];
for (const [title, url, creator, genre, repo, license, description] of LIST) {
  const c = await check(url);
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  out.push({
    id: 0, name: title, full_name: 'curated/' + slug, owner: creator, description, homepage: url, topics: [genre.toLowerCase()], stars: 5000, license,
    html_url: repo ? 'https://github.com/' + repo : '', page: url, check: c, curated: true, genre, title, reverse: REVERSE.has(title),
  });
  console.error(c.ok ? (c.embed ? 'embed' : 'tab  ') : 'DEAD ', title, c.status || c.error || '');
}
writeFileSync(process.argv[2] || 'curated.json', JSON.stringify(out.filter(r => r.check.ok), null, 1));
