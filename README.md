# The Secret of Cell City

A walkable 3D educational game based on the supplied 12-scene story. Follow Dr. Maya and four consistent student characters through a living miniature city, meet nine organelles in story order, solve their challenges, handle a city emergency, and reveal a labelled cell model.

## Run

- `npm install`
- `npm run dev` — open the displayed local address.
- `npm run build` — create the production `dist` directory.
- `npm run preview` — serve the production build.
- `npm test` — run navigation and collision tests.

MAMP or any static server can serve `dist`. Open through HTTP, not by double-clicking the HTML file.

## Controls

| Control | Action |
| --- | --- |
| WASD / arrow keys | Walk with the class, relative to the camera |
| Shift | Jog |
| Drag the scene | Look around |
| Mouse wheel / + / − | Adjust camera distance |
| E | Talk at a nearby unlocked stop; advance conversation |
| M / City map | Toggle aerial map |
| Follow teacher | Resume the guided walk to the current destination |
| Touch arrows | Walk on phones and tablets |
| Journal | Review discoveries; pause movement; reset progress |

Guided travel follows navigable routes and stops for conversations. Movement keys interrupt guidance. The membrane checkpoint must be completed before entering; after that, students may walk around the city freely, with learning chapters unlocked in order. Building collision and the outer boundary keep the group within the playable environment.

## World and story

- Female teacher and four diverse students, with consistent clothes, backpacks, walking limbs, speaking gestures, and formation at stops.
- Street-level camera, optional aerial map, minimap and nearby interaction prompts.
- Opening gate, photosynthesis garden, moving Golgi parcels, ER delivery carts, amino-acid assembly line, power-station steam and lights, flowing reservoir and recycling machinery.
- Walk-in nucleus with a cutaway roof and department status screens.
- Teacher, students and organelles speak in turn; optional browser speech narration.
- Nine mini-games, six emergency problems, nine final matches and persistent progress.
- Final aerial reveal transforms the city into a labelled, simplified cell model.

The visuals are procedural, stylized 3D models. No external image assets are required. WebGL is needed for the city; a text-and-challenge fallback works without it. Font loading has system fallbacks. There are no accounts, analytics or collected student names. Progress is stored only in this browser.

## Biology

The city combines plant and animal examples; its final model is an educational composite, not a literal anatomical reconstruction. Journal notes explain selective permeability, rough and smooth ER, ATP, protein synthesis and the recycling role of plant lytic vacuoles. Food-source examples are distinguished from amino acids assembled by ribosomes.

## Verification

Navigation tests cover the closed gate, opening the checkpoint, building collision, wall sliding, routes around obstacles and the city boundary. Browser checks cover all nine guided routes, dialogue, keyboard takeover, every mini-game, emergency rescue, final matching, persistence, journal, mobile layout and touch controls.
