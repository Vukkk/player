import React, { Component } from 'react';
import Hls from 'hls.js';
import canAutoplay from 'can-autoplay';
import { localStorageGetItem, localStorageSetItem, sessionStorageGetItem, sessionStorageSetItem } from './storage';

class Player extends Component {
  constructor(props) {
    super(props);

    this.state = {
      live: this.props.type === 'live',
      server: this.props.server,
      muted: JSON.parse(localStorageGetItem('muted')),
      bestRegion: sessionStorageGetItem('bestRegion') || this.props.region
    };
  }

  componentDidMount() {
    const player = this.videoNode;
    canAutoplay.video().then(function(obj) {
      if (obj.result === true) {
        if(JSON.parse(localStorageGetItem('player-muted'))) {
          player.muted = true;
        } else {
          player.muted = false;
        }
      }
    });

    this.UWS_CONNECT();
    if(sessionStorageGetItem('bestRegion') === null && this.state.live) {
      this.speedtest();
    }

    player.poster = this.props.streamData.user.offline_banner_url;
    player.volume = JSON.parse(localStorageGetItem('player-volume')) || 1;

    player.onvolumechange = (event) => {
      localStorageSetItem(`player-volume`, player.volume);
      localStorageSetItem(`player-muted`, player.muted);
    };

    player.onplay = (event) => {
      console.log(event);
      if(this.viewCountSocket.readyState === 1) {
        this.viewCountSocket.send(JSON.stringify({action: 'join', channel: this.props.channel}));
      }
    };

    player.onplaying = (event) => {
      console.log(event);
    };

    player.onpause = (event) => {
      console.log(event);
      if(this.viewCountSocket.readyState === 1) {
        this.viewCountSocket.send(JSON.stringify({action: 'leave', channel: this.props.channel}));
      }
    };

    if(!Hls.isSupported() && player.canPlayType('application/vnd.apple.mpegurl')) {
      this.nativeHLS = true;
      console.log('using native HLS support since MSE is not supported');
      if(this.props.streamData.transcodeReady) {
        player.src = `https://${this.state.server}.angelthump.com/hls/${this.props.channel}.m3u8`;
      } else {
        player.src = `https://${this.state.server}.angelthump.com/hls/${this.props.channel}/index.m3u8`;
      }

      player.addEventListener('loadedmetadata', function() {
        player.play();
      });

      return;
    }

    this.nativeHLS = false;
    console.log('MSE is supported, using MSE');
    this.loadHLS();
  }

  UWS_CONNECT() {
    this.viewCountSocket = new WebSocket('wss://viewer-api.angelthump.com/uws/');
    this.viewCountSocket.onopen = () => {
      this.viewCountSocket.send(JSON.stringify({action: 'subscribe', channel: this.props.channel}));
      setInterval(() => {
        this.viewCountSocket.send('{}');
      }, 10 * 1000)
    };

    this.viewCountSocket.onmessage = (message) => {
      const jsonObject = JSON.parse(message.data);
      const action = jsonObject.action;
      if(action === 'reload') {
        window.location.reload();
      } else if (action === 'redirect') {
        window.location.search = `?channel=${jsonObject.punt_username}`;
      } else if (action === 'live') {
        console.log('socket sent live: ' + jsonObject.live);
        if(this.state.live !== jsonObject.live) {
          this.setState({live: jsonObject.live});
        }
        if(jsonObject.live) {
          this.swapEdge();
        }
      } else if (action === 'edge_down') {
        console.log(`edge down: ${jsonObject.edge}`);
        if(this.state.server === jsonObject.edge && this.state.live) {
          this.updateEdge();
        }
      }
    }
  }

  loadHLS() {
    const player = this.videoNode;
    this.hls = new Hls({
      "debug": false,
      "enableWorker": true,
      "startLevel": 0,
      "liveSyncDurationCount": 1,
      "liveMaxLatencyDurationCount": 10,
      "liveBackBufferLength": 30,
      "defaultAudioCodec": "m4a.40.2",
      "manifestLoadingTimeOut": 2000,
      "fragLoadingTimeOut": 4000,
      "levelLoadingTimeOut": 2000,
      "startFragPrefetch": true
    });
    if(this.props.streamData.transcodeReady) {
      this.hls.loadSource(`https://${this.state.server}.angelthump.com/hls/${this.props.channel}.m3u8`);
    } else {
      this.hls.loadSource(`https://${this.state.server}.angelthump.com/hls/${this.props.channel}/index.m3u8`);
    }
    this.hls.attachMedia(player);
    this.hls.on(Hls.Events.MANIFEST_PARSED, function() {
      player.play();
    });

    this.hls.on(Hls.Events.ERROR, function (event, data) {
      if (data.fatal) {
        if(this.viewCountSocket.readyState === 1) {
          this.viewCountSocket.send(JSON.stringify({action: 'leave', channel: this.props.channel}));
        }
        switch(data.type) {
          case Hls.ErrorTypes.NETWORK_ERROR:
            console.error(`fatal network error encountered, try to recover`);
            console.error(data);

            if(data.details !== 'manifestLoadError') {
              this.hls.startLoad();
            } else {
              if(this.state.live) {
                setTimeout(() => {
                  this.swapEdge();
                }, 2000);
              }
            }
            break;
          case Hls.ErrorTypes.MEDIA_ERROR:
            console.error(`fatal media error encountered, try to recover`);
            console.error(data);
            this.hls.recoverMediaError();
            break;
          default:
            this.hls.destroy();
            break;
        }
      } else {
        console.error(data);
      }
    });
  }

  async updateEdge() {
    await fetch(`https://vigor.angelthump.com/edge`, {
      method: "POST",
      headers: new Headers({'content-type': 'application/json'}),
      body: JSON.stringify({
        region: this.state.bestRegion
      })
    })
    .then(response => response.json())
    .then(response => {
      if(this.state.server !== response.server){
        this.setState({ server: response.server});
        console.log(`New edge: ${response.server}`);
        this.swapEdge();
      }
    })
    .catch(() => {
      console.error('failed to get m3u8 server and update');
    });
  }

  swapEdge() {
    const player = this.videoNode;
    console.log(`swapping edge to ${this.state.server}`);
    if(this.nativeHLS) {
      player.src = `https://${this.state.server}.angelthump.com/hls/${this.props.channel}/index.m3u8`;

      player.addEventListener('loadedmetadata', function() {
        player.play();
      });
    } else {
      //hls.loadSource(videoSrc) will work in 0.15? https://github.com/video-dev/hls.js/issues/2473
      this.hls.destroy();
      this.loadHLS();
    }
  }

  async speedtest() {
    const { continent } = this.props;

    const NA_REGIONS = ['nyc3', 'sfo3', 'tor1'];
    const EU_REGIONS = ['ams3', 'fra1', 'lon1'];
    const ASIA_REGIONS = ['sgp1', 'blr1'];

    let responseTimes = [];
    let bestRegion;
    if(continent === 'NA') {
      for(let region of NA_REGIONS) {
        const downloadStart = (new Date()).getTime();
        await fetch(`http://speedtest-${region}.digitalocean.com/10mb.test`)
        .then(response => response.blob())
        .then(() => {
          const downloadEnd = (new Date()).getTime();
          const responseTimeMs = downloadEnd - downloadStart;
          return responseTimes.push(responseTimeMs)
        })
        .catch(() => {
          responseTimes.push('999999999999999');
          console.error(`failed speedtest: ${region}`);
        });
      }
      bestRegion = NA_REGIONS[responseTimes.indexOf(Math.min.apply(null,responseTimes))];
      bestRegion = bestRegion.substring(0,bestRegion.length-1);
    } else if (continent === 'EU') {
      for(let region of EU_REGIONS) {
        const downloadStart = (new Date()).getTime();
        await fetch(`http://speedtest-${region}.digitalocean.com/10mb.test`)
        .then(response => response.blob())
        .then(() => {
          const downloadEnd = (new Date()).getTime();
          const responseTimeMs = downloadEnd - downloadStart;
          return responseTimes.push(responseTimeMs)
        })
        .catch(() => {
          responseTimes.push('999999999999999');
          console.error(`failed speedtest: ${region}`);
        });
      }
      bestRegion = EU_REGIONS[responseTimes.indexOf(Math.min.apply(null,responseTimes))];
      bestRegion = bestRegion.substring(0,bestRegion.length-1);
    } else {
      for(let region of ASIA_REGIONS) {
        const downloadStart = (new Date()).getTime();
        await fetch(`http://speedtest-${region}.digitalocean.com/10mb.test`)
        .then(response => response.blob())
        .then(() => {
          const downloadEnd = (new Date()).getTime();
          const responseTimeMs = downloadEnd - downloadStart;
          return responseTimes.push(responseTimeMs)
        })
        .catch(() => {
          responseTimes.push('999999999999999');
          console.error(`failed speedtest: ${region}`);
        });
      }
      bestRegion = ASIA_REGIONS[responseTimes.indexOf(Math.min.apply(null,responseTimes))];
      bestRegion = bestRegion.substring(0,bestRegion.length-1);
    }

    if(!this.state.server.startsWith(bestRegion)) {
      this.setState({bestRegion: bestRegion}, () => {
        this.updateEdge();
      });
    }
    sessionStorageSetItem('bestRegion', bestRegion);

    console.log(responseTimes);
    console.log(`Best region based on speedtest: ${bestRegion}`);
  }
  
  componentWillUnmount() {
    if (this.hls) {
      this.hls.destroy();
    }
  }

  render() {
    return (
      <div className="player-div">
        <video muted autoPlay playsInline controls ref={ node => this.videoNode = node } className="player"></video>
      </div>
    )
  }
}

export default Player;