import { Controls, SailingBoat, jointAngle } from './sailingModel';
import { SailingState, Weather, WeatherPreset, initialState, makeWeather, step, weatherPresets } from './sailingPhysics';

interface InputChange { tick: number; angles: Controls }
export interface SailingTrace {
  weather: WeatherPreset;
  seed: number;
  windSpeed?: number;
  ticks: number;
  inputs: readonly InputChange[];
}

export function neutralControls(boat: SailingBoat): Controls {
  return Object.fromEntries(boat.parts.flatMap(part => part.joint ? [[part.id, jointAngle(part.joint)]] : []));
}

// Owns simulation ticks and their input changes. Playback is independent of
// display cadence and uses the original weather and seed.
export class SailingRun {
  readonly conditions: Weather;
  readonly windSpeed?: number;
  state: SailingState;
  tick = 0;
  angles: Controls;
  private readonly history: InputChange[] = [];
  private cursor = 0;

  constructor(readonly boat: SailingBoat, readonly weather: WeatherPreset, readonly seed: number,
    private readonly playback?: SailingTrace, windSpeed?: number) {
    this.windSpeed = playback ? playback.windSpeed : windSpeed;
    this.conditions = makeWeather(weatherPresets[weather], seed, this.windSpeed);
    this.state = initialState(boat, this.conditions);
    this.angles = neutralControls(boat);
  }

  get finished() {
    return !!this.playback && this.tick >= this.playback.ticks;
  }

  advance(count: number, requested: Controls) {
    for (let i = 0; i < count && !this.finished; i++) {
      if (this.playback) {
        const next = this.playback.inputs[this.cursor];
        if (next?.tick === this.tick) {
          this.angles = next.angles;
          this.cursor++;
        }
      } else if (this.tick === 0 || Object.keys(this.angles).length !== Object.keys(requested).length ||
          Object.keys(requested).some(id => this.angles[id] !== requested[id])) {
        this.angles = { ...requested };
        this.history.push({ tick: this.tick, angles: this.angles });
      }
      this.state = step(this.boat, this.state, this.angles, this.conditions);
      this.tick++;
    }
  }

  trace(): SailingTrace {
    return this.playback ?? { weather: this.weather, seed: this.seed, windSpeed: this.windSpeed, ticks: this.tick, inputs: [...this.history] };
  }
}
