import { appendStarter, connectGpsLocation, setGpsPort, setPhysicalSetting } from './nodeConfiguration';

describe('guided configuration edits', () => {
    const original = ['; initial settings', 'node = 11', '[Nav = 12]', '  name = Pilot', '  future = "quoted; value"',
        '; GPS section below', '[NMEA = 10]', '  name = GPS', '  port  = "1, 255"  ; keep secondary',
        '  publish = "satellites, HDOP"   ; keep list', ''].join('\r\n');

    it('appends a unique GPS section and changes only the reviewed serial and connection lines', () => {
        const added = appendStarter(original, 11, 'NMEA')!;
        expect(added).toEqual({ channel: 2, line: 12, text: original + '\r\n[NMEA = 2]\r\n  name = GPS2\r\n' });
        const port = setGpsPort(added.text, 11, 10, '2')!;
        expect(port.text).toBe(added.text.replace('"1, 255"', '"2, 255"'));
        const connection = connectGpsLocation(port.text, 11, 10, 12, 8)!;
        expect(connection.changes).toEqual([
            { before: '  publish = "satellites, HDOP"   ; keep list', after: '  publish = "satellites, HDOP, location"   ; keep list' },
            { after: '  $location = @>10.8' },
        ]);
        expect(connection.text).toBe(port.text.replace('  future = "quoted; value"\r\n', '  future = "quoted; value"\r\n  $location = @>10.8\r\n')
            .replace('"satellites, HDOP"', '"satellites, HDOP, location"'));
        expect(connectGpsLocation(connection.text, 11, 10, 12, 8)?.changes).toEqual([]);
    });

    it('refuses ambiguous declarations or a primary port already used as the secondary', () => {
        expect(setGpsPort(original.replace('1, 255', '1, 2'), 11, 10, '2')).toBeUndefined();
        expect(connectGpsLocation(original + 'publish = packets', 11, 10, 12, 8)).toBeUndefined();
        expect(appendStarter(original + '[Nav = 12]\r\n', 11, 'NMEA')).toBeUndefined();
    });
});

it('edits a Probe pin alias without adding a second firmware declaration', () => {
    const draft = 'node = 11\r\n[Probe = 18]\r\n  pin032 = "digital"  ; retain\r\n';
    expect(setPhysicalSetting(draft, 11, 18, { gpio: 32, mode: 'serial,9600' })?.text)
        .toBe(draft.replace('"digital"', '"serial,9600"'));
    expect(setPhysicalSetting(draft + '  pin32 = digital\r\n', 11, 18, { gpio: 32, mode: 'analog' })).toBeUndefined();
});
