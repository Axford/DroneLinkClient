import { registerCodecTests } from '@dronelink/protocol/testing';
import loadCodec from './load-codec.cjs';
const { DroneLinkMsg } = await loadCodec();
registerCodecTests(DroneLinkMsg, 'frontend');
