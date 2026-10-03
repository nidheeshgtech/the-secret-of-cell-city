# The Secret of Cell City

A guided 3D educational game based on the supplied 12-scene story. Watch Dr. Maya and four consistent student characters travel through a living miniature city, meet nine organelles in story order, solve their challenges, handle a city emergency, and reveal a labelled cell model.

## Run

- `npm install`
- `npm run dev` — open the displayed local address.
- `npm run build` — create the production `dist` directory.
- `npm run preview` — serve the production build.
- `npm test` — run navigation and collision tests.

MAMP or any static server can serve `dist`. Open through HTTP, not by double-clicking the HTML file.

## Play

Select **Start field trip**. Class travels automatically; camera follows its movement. Dialogue advances on its own. Answer each challenge to continue. **Pause trip** and **Resume trip** share one control, preserving current scene and dialogue timing. City map and journal remain available. Drag the scene to look around or use camera zoom controls; guided camera recenters behind the class.

Guided travel follows navigable routes and stops for conversations. Cell membrane checkpoint must be completed before class enters. Building collision and outer boundary keep class within playable environment.

## World and story

- Female teacher and four diverse students, with consistent clothes, backpacks, walking limbs, speaking gestures, and formation at stops.
- Street-level tracking camera, optional aerial map and minimap.
- Opening gate, photosynthesis garden, moving Golgi parcels, ER delivery carts, amino-acid assembly line, power-station steam and lights, flowing reservoir and recycling machinery.
- Walk-in nucleus with a cutaway roof and department status screens.
- Teacher, students and organelles speak in turn; optional browser speech narration.
- Nine mini-games, six emergency problems, nine final matches and persistent progress.
- Final aerial reveal transforms the city into a labelled, simplified cell model.

The visuals are procedural, stylized 3D models. No external image assets are required. WebGL is needed for the city; a text-and-challenge fallback works without it. Font loading has system fallbacks. There are no accounts, analytics or collected student names. Progress is stored only in this browser.

## Biology

The city combines plant and animal examples; its final model is an educational composite, not a literal anatomical reconstruction. Journal notes explain selective permeability, rough and smooth ER, ATP, protein synthesis and the recycling role of plant lytic vacuoles. Food-source examples are distinguished from amino acids assembled by ribosomes.

## Verification

Navigation tests cover closed gate, opening checkpoint, building collision, wall sliding, routes around obstacles and city boundary. Browser checks cover guided travel, automatic dialogue, pause/resume timing, challenge progression, persistence, journal and mobile layout.
