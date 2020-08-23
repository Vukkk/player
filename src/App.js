import React, { Component } from 'react';
import './css/player.css';
import Player from './player';

class App extends Component {
  constructor(props) {
    super(props);

    this.state = {
      server: null
    };
  }

  async componentDidMount() {
    const search = window.location.search;
    const params = new URLSearchParams(search);
    this.channel = params.get('channel')

    if(!this.channel) return;

    let streamData;
    await fetch(`https://api.angelthump.com/v2/streams/${this.channel}`)
    .then(response => response.json())
    .then(response => {
      streamData = response;
    })
    .catch(() => {
      console.error('failed to get m3u8 server');
    });

    await fetch(`https://vigor.angelthump.com/${this.channel}/edge`)
    .then(response => response.json())
    .then(response => {
      this.setState({ server: response.server, continent: response.continent, region: response.region, streamData: streamData});
    })
    .catch(() => {
      console.error('failed to get m3u8 server');
    });
  }

  render() {
    if(!this.channel || !this.state.streamData) {
      return null;
    } else if(this.state.streamData.user.password_protect) {
      return null;
    } else {
      return(
      <div className="app">
        <Player server={this.state.server} continent={this.state.continent} channel={this.channel} streamData={this.state.streamData}/>
      </div>)
    }
  }
}

export default App;
