# Perfect Balance

![A balance scale with a keg of beer on one pan and a stack of televisions on the other](docs/screenshot.png)

A daily 3D balance-scale game. You get a thing on one pan, say an elephant, and a pile of everyday objects to stack on the other until you think the weights match. Then the scale lets go. Land between 3% light and 4% heavy and the round's yours; five rounds a day, the same for everyone, plus a freeplay mode with its own rules.

Play it at https://perfect-balance.kieronoates.workers.dev/

## Why I built this

I've always been bad at guessing how heavy things are, and I wanted a game that makes that guess the whole point, with real objects, real weights and real physics doing the judging rather than a number on a screen. Every object you're asked to match has its weight checked against two independent sources, so if you look one up you'll land close to what the scale used.

## Running it locally

```sh
npm install
npm run dev
```

`npm run build` makes the production build in `dist/`, and `npm run check` type-checks everything. The models in `src/assets/models` are already built; `npm run models` rebuilds them from the original downloads, which aren't in the repo.

## How it works

- Each round is generated from a seed, solution first, so every round can be won, and a daily puzzle is the same for everyone.
- Physics runs in a Web Worker with Jolt (WebAssembly). Each round's world is scaled to the objects in it, so a sugar cube and an elephant both behave sensibly.
- The 200 objects and their sources live in `src/data/catalogue.json`. The game only downloads the fields it plays with.
- Models are low-poly, recoloured to one shared palette, and compressed with meshopt; a round's models come to about 30 KB.

## Built with

three.js, Jolt Physics, camera-controls, Svelte and Vite, with glTF Transform and meshoptimizer for the model pipeline. Type is Fraunces and Instrument Sans, both under the SIL Open Font License.

## Credits

- 3D models by [Kenney](https://kenney.nl) (CC0), Quaternius, CreativeTrio and Isa Lousberg (CC0, via [Poly Pizza](https://poly.pizza)), and Poly by Google (CC BY 3.0, recoloured and simplified). Every model's source and licence is in `src/data/credits.json`.
- Weights come from standards bodies, sports governing bodies, manufacturers, government databases and published studies; each entry in `src/data/catalogue.json` quotes its source.

## Licence

The code is MIT licensed (see `LICENSE`). The models and fonts keep their own licences.
