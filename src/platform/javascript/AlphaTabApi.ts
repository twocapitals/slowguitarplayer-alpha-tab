import { AlphaTabApiBase } from '@src/AlphaTabApiBase';
import { AlphaSynthMidiFileHandler } from '@src/midi/AlphaSynthMidiFileHandler';
import { MidiFileGenerator } from '@src/midi/MidiFileGenerator';
import { MidiFile } from '@src/midi/MidiFile';
import { LayoutMode } from '@src/LayoutMode';
import { IEventEmitterOfT, EventEmitterOfT } from '@src/EventEmitter';
import { Track } from '@src/model/Track';
import { AlphaSynthWebWorkerApi } from '@src/platform/javascript/AlphaSynthWebWorkerApi';
import { BrowserUiFacade } from '@src/platform/javascript/BrowserUiFacade';
import { ProgressEventArgs } from '@src/ProgressEventArgs';
import { Settings } from '@src/Settings';
import { JsonConverter } from '@src/model/JsonConverter';
import { SettingsSerializer } from '@src/generated/SettingsSerializer';

/**
 * @target web
 */
export class AlphaTabApi extends AlphaTabApiBase<any | Settings> {
    public constructor(element: HTMLElement, options: any | Settings) {
        super(new BrowserUiFacade(element), options);
    }

    public override tex(tex: string, tracks?: number[]): void {
        let browser: BrowserUiFacade = this.uiFacade as BrowserUiFacade;
        super.tex(tex, browser.parseTracks(tracks));
    }

    public print(width?: string, additionalSettings: unknown = null): void {
        // prepare a popup window for printing (a4 width, window height, centered)
        let preview: Window = window.open('', '', 'width=0,height=0')!;
        let a4: HTMLElement = preview.document.createElement('div');
        if (width) {
            a4.style.width = width;
        } else {
            if (this.settings.display.layoutMode === LayoutMode.Horizontal) {
                a4.style.width = '297mm';
            } else {
                a4.style.width = '210mm';
            }
        }
        // the style is a workaround for browser having problems with printing using absolute positions. 
        preview.document.write(`
        <!DOCTYPE html>
        <html>
          <head>
            <style>
            .at-surface {
                width: auto !important;
                height: auto !important;
            }
            .at-surface > div {
                position: relative!important;
                left: auto !important;
                top: auto !important;
                break-inside: avoid;
            }
            </style>
          </head>
          <body></body>
        </html>
        `);
        const score = this.score;
        if (score) {
            if (score.artist && score.title) {
                preview.document.title = `${score.title} - ${score.artist}`;
            } else if (score.title) {
                preview.document.title = `${score.title}`;
            }
        }
        preview.document.body.appendChild(a4);
        let dualScreenLeft: number =
            typeof (window as any)['screenLeft'] !== 'undefined'
                ? (window as any)['screenLeft']
                : (window as any)['left'];
        let dualScreenTop: number =
            typeof (window as any)['screenTop'] !== 'undefined' ? (window as any)['screenTop'] : (window as any)['top'];
        let screenWidth: number =
            "innerWidth" in window
                ? window.innerWidth
                : "clientWidth" in document.documentElement
                    ? document.documentElement.clientWidth
                    : (window as Window).screen.width;
        let screenHeight: number =
            "innerHeight" in window
                ? window.innerHeight
                : "clientHeight" in document.documentElement
                    ? document.documentElement.clientHeight
                    :  (window as Window).screen.height;
        let w: number = a4.offsetWidth + 50;
        let h: number = window.innerHeight;
        let left: number = ((screenWidth / 2) | 0) - ((w / 2) | 0) + dualScreenLeft;
        let top: number = ((screenHeight / 2) | 0) - ((h / 2) | 0) + dualScreenTop;
        preview.resizeTo(w, h);
        preview.moveTo(left, top);
        preview.focus();
        // render alphaTab
        let settings: Settings = JsonConverter.jsObjectToSettings(JsonConverter.settingsToJsObject(this.settings));
        settings.core.enableLazyLoading = false;
        settings.core.useWorkers = true;
        settings.core.file = null;
        settings.core.tracks = null;
        settings.player.enableCursor = false;
        settings.player.enablePlayer = false;
        settings.player.enableElementHighlighting = false;
        settings.player.enableUserInteraction = false;
        settings.player.soundFont = null;
        settings.display.scale = 0.8;
        settings.display.stretchForce = 0.8;
        SettingsSerializer.fromJson(settings, additionalSettings);
        let alphaTab: AlphaTabApi = new AlphaTabApi(a4, settings);
        preview.onunload = () => {
            alphaTab.destroy();
        };
        alphaTab.renderer.postRenderFinished.on(() => {
            preview.print();
        });
        alphaTab.renderTracks(this.tracks);

    }

    public downloadMidi(): void {
        if (!this.score) {
            return;
        }

        let midiFile: MidiFile = new MidiFile();
        let handler: AlphaSynthMidiFileHandler = new AlphaSynthMidiFileHandler(midiFile);
        let generator: MidiFileGenerator = new MidiFileGenerator(this.score, this.settings, handler);
        generator.generate();
        let binary: Uint8Array = midiFile.toBinary();
        let fileName: string = !this.score.title ? 'File.mid' : `${this.score.title}.mid`;
        let dlLink: HTMLAnchorElement = document.createElement('a');
        dlLink.download = fileName;
        let blob: Blob = new Blob([binary], {
            type: 'audio/midi'
        });
        let url: string = URL.createObjectURL(blob);
        dlLink.href = url;
        dlLink.style.display = 'none';
        document.body.appendChild(dlLink);
        dlLink.click();
        document.body.removeChild(dlLink);
    }

    public override changeTrackMute(tracks: Track[], mute: boolean): void {
        let trackList: Track[] = this.trackIndexesToTracks((this.uiFacade as BrowserUiFacade).parseTracks(tracks));
        super.changeTrackMute(trackList, mute);
    }

    public override changeTrackSolo(tracks: Track[], solo: boolean): void {
        let trackList: Track[] = this.trackIndexesToTracks((this.uiFacade as BrowserUiFacade).parseTracks(tracks));
        super.changeTrackSolo(trackList, solo);
    }

    public override changeTrackVolume(tracks: Track[], volume: number): void {
        let trackList: Track[] = this.trackIndexesToTracks((this.uiFacade as BrowserUiFacade).parseTracks(tracks));
        super.changeTrackVolume(trackList, volume);
    }

    private trackIndexesToTracks(trackIndexes: number[]): Track[] {
        if (!this.score) {
            return [];
        }
        let tracks: Track[] = [];
        if (trackIndexes.length === 1 && trackIndexes[0] === -1) {
            for (let track of this.score.tracks) {
                tracks.push(track);
            }
        } else {
            for (let index of trackIndexes) {
                if (index >= 0 && index < this.score.tracks.length) {
                    tracks.push(this.score.tracks[index]);
                }
            }
        }
        return tracks;
    }

    public soundFontLoad: IEventEmitterOfT<ProgressEventArgs> = new EventEmitterOfT<ProgressEventArgs>();
    public loadSoundFontFromUrl(url: string, append: boolean): void {
        if (!this.player) {
            return;
        }
        (this.player as AlphaSynthWebWorkerApi).loadSoundFontFromUrl(
            url,
            append,
            e => {
                (this.soundFontLoad as EventEmitterOfT<ProgressEventArgs>).trigger(e);
                this.uiFacade.triggerEvent(this.container, 'soundFontLoad', e);
            }
        );
    }
}
