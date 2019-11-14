require('!style-loader!css-loader!./css/banned-page.css');
import logo from '../dist/assets/error.png';
import React from 'react';

export default class Banned extends React.Component {
    
    constructor(props) {
        super(props);
     }

    componentDidMount() {
    }

    componentWillUnmount() {
    }

    render() {
        let channel = this.props.channel;
        return (
            <div>
                <div className='banned'>
                    <a href='https://angelthump.com'>
                        <img src={logo}/>
                    </a>
                    <div className='banned-text' id='text'>
                        <h1>{channel} is banned</h1>
                        <p><a href="https://angelthump.com" class="error-link">Back to the home page</a></p>
                    </div>
                </div>
            </div>
        )
    }
}