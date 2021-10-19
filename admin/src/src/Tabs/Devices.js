import React, {Component} from 'react';
import {withStyles} from '@material-ui/core/styles';
import PropTypes from 'prop-types';
import TextField from '@material-ui/core/TextField';
import Button from '@material-ui/core/Button';
import IconButton from '@material-ui/core/IconButton';
import Switch from '@material-ui/core/Switch';
import {MdEdit as IconEdit} from 'react-icons/md';

import Utils from '@iobroker/adapter-react/Components/Utils';
import I18n from '@iobroker/adapter-react/i18n';
import DialogTitle from '@material-ui/core/DialogTitle';
import DialogContent from '@material-ui/core/DialogContent';
import DialogActions from '@material-ui/core/DialogActions';
import Dialog from '@material-ui/core/Dialog';
import MessageDialog from '@iobroker/adapter-react/Dialogs/Message';
import CircularProgress from '@material-ui/core/CircularProgress';
import IconClose from "@material-ui/icons/Close";
import IconPlay from '@material-ui/icons/PlayArrow';
import IconPair from '@material-ui/icons/Link';
import IconUnpair from '@material-ui/icons/LinkOff';
import IconIdent from '@material-ui/icons/QuestionAnswer';

import Paper from '@material-ui/core/Paper';
import Table from '@material-ui/core/Table';
import TableBody from '@material-ui/core/TableBody';
import TableCell from '@material-ui/core/TableCell';
import TableContainer from '@material-ui/core/TableContainer';
import TableHead from '@material-ui/core/TableHead';
import TableRow from '@material-ui/core/TableRow';

const styles = theme => ({
    tab: {
        width: '100%',
        height: '100%'
    },
    container: {

    },
    notAlive: {
        width: '100%',
        textAlign: 'center',
        fontSize: 16,
        color: '#FF8080'
    }
});

class Devices extends Component {
    constructor(props) {
        super(props);

        this.state = {
            devices: [],
            loading: true,
            alive: false,
        };

        this.aliveID = `system.adapter.${this.props.adapterName}.${this.props.instance}.alive`;
    }

    getData() {
        this.props.socket.getState(this.aliveID)
            .then(state => {
                if (state && state.val) {
                    this.props.socket.sendTo(null, 'getDiscoveredDevices')
                        .then(devices => this.setState({devices, loading: false, alive: true}));
                } else if (this.state.alive) {
                    this.setState({alive: false});
                }
            });
    }

    onAliveChanged = (id, state) => {
        if (id === this.aliveID) {
            if ((!state || !state.val) && this.state.alive) {
                this.setState({alive: false});
            } else if (state && state.val && !this.state.alive) {
                this.setState({alive: true});
            }
        }
    }

    componentDidMount() {
        this.props.socket.subscribeState(this.aliveID, this.onAliveChanged);
        this.getData();
    }

    componentWillUnmount() {
        this.props.socket.unsubscribeState(this.aliveID, this.onAliveChanged);
    }

    renderMessage() {
        if (this.state.message) {
            return <MessageDialog text={this.state.message} onClose={() => this.setState({message: ''})}/>;
        } else {
            return null;
        }
    }

    renderDevice(device) {
        return <TableRow>
            <TableCell>{device.id}</TableCell>
            <TableCell>{device.serviceType}</TableCell>
            <TableCell>{device.connected}</TableCell>
            <TableCell>{device.discovered}</TableCell>
            <TableCell>{device.discoveredName}</TableCell>
            <TableCell>{device.discoveredCategory}</TableCell>
            <TableCell>
                {device.connected ? <IconButton title={I18n.t('Identify')} size="small"><IconIdent /></IconButton> : null}
                {device.availableToPair ? <IconButton title={I18n.t('Pair')} size="small"><IconPair /></IconButton> : null}
                {device.pairedWithThisInstance ? <IconButton title={I18n.t('Unpair')} size="small"><IconUnpair /></IconButton> : null}
            </TableCell>
        </TableRow>;
    }

    renderTable() {
        return <TableContainer className={this.props.classes.container}>
            <Table stickyHeader aria-label="sticky table">
                <TableHead>
                    <TableRow>
                        <TableCell>ID</TableCell>
                        <TableCell>{I18n.t('Type')}</TableCell>
                        <TableCell>{I18n.t('Connected')}</TableCell>
                        <TableCell>{I18n.t('Discovered')}</TableCell>
                        <TableCell>{I18n.t('Name')}</TableCell>
                        <TableCell>{I18n.t('Category')}</TableCell>
                        <TableCell>{I18n.t('Pairing')}</TableCell>
                    </TableRow>
                </TableHead>
                <TableBody>
                    {this.state.devices.map(device => this.renderDevice(device))}
                </TableBody>
            </Table>
        </TableContainer>;
    }

    render() {
        if (this.state.loading) {
            return <CircularProgress />;
        }
        return <Paper className={this.props.classes.tab}>
            {this.state.alive && this.renderTable()}
            {this.state.alive ? null : <div className={this.props.classes.notAlive}>{I18n.t('Instance must be started to set up the devices')}</div>}
            {this.state.alive ? null : <Button onClick={() => {
                this.props.socket.setState(this.aliveID, true);
            }} iconStart={<IconPlay />}>{I18n.t('Start?')}</Button>}
            {this.renderMessage()}
        </Paper>;
    }
}

Devices.propTypes = {
    common: PropTypes.object.isRequired,
    native: PropTypes.object.isRequired,
    instance: PropTypes.number.isRequired,
    adapterName: PropTypes.string.isRequired,
    onError: PropTypes.func,
    onLoad: PropTypes.func,
    onChange: PropTypes.func,
    socket: PropTypes.object.isRequired,
};

export default withStyles(styles)(Devices);
