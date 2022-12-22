import React, {Component} from 'react';
import { withStyles } from '@mui/styles';
import PropTypes from 'prop-types';

import TextField from '@mui/material/TextField';
import FormControlLabel from '@mui/material/FormControlLabel';
import Checkbox from '@mui/material/Checkbox';

import { I18n, Utils } from '@iobroker/adapter-react-v5';

const styles = () => ({
    tab: {
        width: '100%',
        minHeight: '100%'
    },
    input: {
        minWidth: 350
    },
    button: {
        marginRight: 20,
        marginBottom: 40,
    },
    card: {
        maxWidth: 345,
        textAlign: 'center'
    },
    media: {
        height: 180,
    },
    column: {
        display: 'inline-block',
        verticalAlign: 'top',
        marginRight: 20
    },
    columnLogo: {
        width: 350,
        marginRight: 0
    },
    columnSettings: {
        width: 'calc(100% - 370px)',
    },
    cannotUse: {
        color: 'red',
        fontWeight: 'bold',
    },
    hintUnsaved: {
        fontSize: 12,
        color: 'red',
        fontStyle: 'italic',
    }
});

class Options extends Component {
    constructor(props) {
        super(props);

        this.state = {};
    }

    renderInput(title, attr, type, helpText) {
        return <TextField
            variant="standard"
            label={I18n.t(title) }
            className={this.props.classes.input}
            value={this.props.native[attr]}
            type={type || 'text'}
            helperText={helpText || ''}
            onChange={e => this.props.onChange(attr, e.target.value)}
            margin="normal"
        />;
    }

    renderCheckbox(title, attr, style) {
        return <FormControlLabel key={attr} style={Object.assign({paddingTop: 5}, style)} className={this.props.classes.controlElement}
              control={
                  <Checkbox
                      checked={this.props.native[attr]}
                      onChange={() => this.props.onChange(attr, !this.props.native[attr])}
                      color="primary"
                  />
              }
              label={I18n.t(title)}
        />;
    }

    render() {
        return <form className={this.props.classes.tab}>
            {/*<Logo
                classes={{}}
                instance={ this.props.instance }
                common={ this.props.common }
                native={ this.props.native }
                onError={ text => this.setState({errorText: text}) }
                onLoad={ this.props.onLoad }
            />*/}
            <div className={Utils.clsx(this.props.classes.column, this.props.classes.columnSettings)}>
                {this.renderCheckbox('Discover over IP', 'discoverIp')}
                {this.renderCheckbox('Discover over Bluetooth', 'discoverBle')}
                <br/>
                {this.renderInput('Data polling interval for IP', 'dataPollingIntervalIp', 'number', I18n.t('seconds'))}<br/>
                {this.renderInput('Data polling interval for Bluetooth', 'dataPollingIntervalBle', 'number', I18n.t('seconds'))}<br/>
                {this.renderCheckbox('Update only changed values', 'updateOnlyChangedValues')}
            </div>
        </form>;
    }
}

Options.propTypes = {
    common: PropTypes.object.isRequired,
    native: PropTypes.object.isRequired,
    instance: PropTypes.number.isRequired,
    adapterName: PropTypes.string.isRequired,
    onError: PropTypes.func,
    onLoad: PropTypes.func,
    onChange: PropTypes.func,
    changed: PropTypes.bool,
};

export default withStyles(styles)(Options);
