import React, {Component} from 'react';
import { withStyles } from '@mui/styles';
import PropTypes from 'prop-types';

import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import Popover from '@mui/material/Popover';
import Paper from '@mui/material/Paper';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import CircularProgress from '@mui/material/CircularProgress';
import Fab from '@mui/material/Fab';
import { TextField } from '@mui/material';

import IconPlay from '@mui/icons-material/PlayArrow';
import IconPair from '@mui/icons-material/Link';
import IconUnpair from '@mui/icons-material/LinkOff';
import IconIdent from '@mui/icons-material/QuestionAnswer';
import IconDiscovered from '@mui/icons-material/Visibility';
import IconConnected from '@mui/icons-material/Wifi';
import IconRefresh from '@mui/icons-material/Refresh';
import IconBluetooth from '@mui/icons-material/Bluetooth';
import IconIP from '@mui/icons-material/SettingsEthernet';
//import IconNotConnected from '@mui/icons-material/WifiOff';

import { I18n, Utils, Message as MessageDialog } from '@iobroker/adapter-react-v5';

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
    },
    cellId: {
        width: 200,
    },
    cellButtons: {
        width: 90
    },
    cellType: {
        width: 50
    },
    cellName: {
    },
    cellCategory: {
        width: 150
    },
    cellConnected: {
        width: 80
    },
    cellDiscovered: {
        width: 80
    },
    popover: {
        padding: 16
    },
    iconIP: {
        color: theme.palette.mode === 'dark' ? '#057305' : '#05a605'
    },
    iconBluetooth: {
        color: theme.palette.mode === 'dark' ? '#0101e0' : '#0000bd'
    },
    buttonSmall: {
        marginRight: 4,
    },
    buttonIdent: {

    },
    buttonPair: {

    },
    buttonUnpair: {

    }
});

class Devices extends Component {
    constructor(props) {
        super(props);

        this.state = {
            devices: [],
            loading: true,
            alive: false,
            processing: false,
            message: '',
            popover: '',
            showPinDialog: false,
            pin: '',
            pinFor: '',
            showSureDialog: false,
        };

        this.aliveID = `system.adapter.${this.props.adapterName}.${this.props.instance}.alive`;
    }
    getDataWithTimeout() {
        this.getTimeout && clearTimeout(this.getTimeout);
        this.getTimeout = setTimeout(() => {
            this.getTimeout = null;
            this.getData();
        }, 1500);
    }

    getData() {
        this.props.socket.getState(this.aliveID)
            .then(state => {
                if (state && state.val) {
                    this.props.socket.sendTo(`${this.props.adapterName}.${this.props.instance}`, 'getDiscoveredDevices')
                        .then(result => this.setState({devices: result.devices || [], loading: false, alive: true}));
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
        this.hidePopuTimer && clearTimeout(this.hidePopuTimer);
        this.getTimeout && clearTimeout(this.getTimeout);
    }

    renderMessage() {
        if (this.state.message) {
            return <MessageDialog text={this.state.message} title={I18n.t('Error')} onClose={() =>
                this.setState({message: ''})}/>;
        } else {
            return null;
        }
    }

    onPair(deviceId, pin) {
        this.setState({processing: true}, () => {
            this.props.socket.sendTo(`${this.props.adapterName}.${this.props.instance}`, 'pairDevice', {deviceId, pin})
                .then(result => {
                    if (result.error) {
                        this.setState({processing: false, message: result.error});
                    } else {
                        this.getDataWithTimeout();
                        this.setState({processing: false, popover: I18n.t('Paired')});
                    }
                })
                .catch(error => this.setState({processing: false, message: JSON.stringify(error)}));
        });
    }

    onUnpair(deviceId) {
        this.setState({processing: true}, () => {
            this.props.socket.sendTo(`${this.props.adapterName}.${this.props.instance}`, 'unpairDevice', {deviceId})
                .then(result => {
                    if (result.error) {
                        this.setState({processing: false, message: result.error});
                    } else {
                        this.getDataWithTimeout();
                        this.setState({processing: false, popover: I18n.t('Unpaired')});
                    }
                })
                .catch(error => this.setState({processing: false, message:JSON.stringify(error)}));
        });
    }

    onIdent(deviceId) {
        this.setState({processing: true}, () => {
            this.props.socket.sendTo(`${this.props.adapterName}.${this.props.instance}`, 'identify', {deviceId})
                .then(result => {
                    if (result.error) {
                        this.setState({processing: false, message: result.error});
                    } else {
                        this.getDataWithTimeout();
                        this.setState({ processing: false, popover: I18n.t('Identified') });
                    }
                })
                .catch(error => this.setState({ processing: false, message: JSON.stringify(error) }));
        });
    }

    renderDevice(device, classes) {
        return <TableRow key={device.id}>
            <TableCell className={classes.cellId}>{device.id}</TableCell>
            <TableCell className={classes.cellName}>{device.discoveredName}</TableCell>
            <TableCell className={classes.cellCategory}>{device.discoveredCategory}</TableCell>
            <TableCell className={classes.cellType}>{device.serviceType === 'BLE' ? <IconBluetooth className={this.props.classes.iconBluetooth}/> : <IconIP className={this.props.classes.iconIP} />}</TableCell>
            <TableCell className={classes.cellConnected}>{device.connected ? <IconConnected title={I18n.t('Connected')} /> : null}</TableCell>
            <TableCell className={classes.cellDiscovered}>{device.discovered ? <IconDiscovered title={I18n.t('Discovered')} /> : null}</TableCell>
            <TableCell className={classes.cellButtons}>
                {device.availableToPair ?
                    <Fab
                        className={Utils.clsx(this.props.classes.buttonSmall, this.props.classes.buttonIdent)}
                        disabled={this.state.processing}
                        title={I18n.t('Identify')}
                        size="small"
                        onClick={() => this.onIdent(device.id)}
                    ><IconIdent /></Fab> : null
                }
                {device.availableToPair ?
                    <Fab
                        className={Utils.clsx(this.props.classes.buttonSmall, this.props.classes.buttonPair)}
                        disabled={this.state.processing}
                        title={I18n.t('Pair')}
                        size="small"
                        onClick={() => this.setState({ showPinDialog: true, pin: '', pinFor: device.id })}
                    ><IconPair /></Fab> : null}
                {device.pairedWithThisInstance ?
                    <Fab
                        className={Utils.clsx(this.props.classes.buttonSmall, this.props.classes.buttonUnpair)}
                        disabled={this.state.processing}
                        title={I18n.t('Unpair')}
                        size="small"
                        onClick={() => this.setState({ showSureDialog: true, pinFor: device.id })}
                    ><IconUnpair /></Fab> : null}
            </TableCell>
        </TableRow>;
    }

    renderTable() {
        const classes = this.props.classes;
        return <TableContainer className={this.props.classes.container} >
            <Table stickyHeader size="small" aria-label="sticky table">
                <TableHead>
                    <TableRow>
                        <TableCell className={classes.cellId}>
                            <IconButton onClick={() => this.getData()} size="small" title={I18n.t('Refresh devices list')}>
                                <IconRefresh/>
                            </IconButton>
                            {I18n.t('ID')}</TableCell>
                        <TableCell className={classes.cellName}>{I18n.t('Name')}</TableCell>
                        <TableCell className={classes.cellCategory}>{I18n.t('Category')}</TableCell>
                        <TableCell className={classes.cellType}>{I18n.t('Type')}</TableCell>
                        <TableCell className={classes.cellConnected}>{I18n.t('Connected')}</TableCell>
                        <TableCell className={classes.cellDiscovered}>{I18n.t('Discovered')}</TableCell>
                        <TableCell className={classes.cellButtons}/>
                    </TableRow>
                </TableHead>
                <TableBody>
                    {this.state.devices.map(device => this.renderDevice(device, classes))}
                </TableBody>
            </Table>
        </TableContainer>;
    }

    showPopper() {
        if (this.state.popover && !this.hidePopuTimer) {
            this.hidePopuTimer = setTimeout(() => {
                this.hidePopuTimer = null;
                this.setState({popover: ''});
            }, 4000);
        }

        return <Popover
            open={!!this.state.popover}
            anchorOrigin={{
                vertical: 'bottom',
                horizontal: 'center',
            }}
            onClose={() => this.setState({popover: ''})}
            onClick={() => this.setState({popover: ''})}
        >
            <Paper className={this.props.classes.popover}>
                {this.state.popover}
            </Paper>
        </Popover>
    }

    renderPinDialog() {
        return <Dialog
            open={this.state.showPinDialog}
            onClose={() => this.setState({showPinDialog: false, pin: '', pinFor: ''})}
        >
            <DialogTitle>{I18n.t('Please enter PIN')}</DialogTitle>
            <DialogContent>
                <TextField
                    variant="standard"
                    value={this.state.pin}
                    onChange={e => this.setState({pin: e.target.value})}
                    label={I18n.t('PIN')}
                    fullWidth
                    autoFocus
                    onKeyUp={e => {
                        if (e.keyCode === 13 && (this.state.pin || this.state.pin === 0)) {
                            const deviceId = this.state.pinFor;
                            const pin = this.state.pin;
                            this.setState({showPinDialog: false, pin: '', pinFor: ''}, () =>
                                this.onPair(deviceId, pin));
                        }
                    }}
                />
            </DialogContent>
            <DialogActions>
                <Button
                    variant="contained"
                    color="primary"
                    disabled={!this.state.pin && this.state.pin !== 0}
                    onClick={()=> {
                        const deviceId = this.state.pinFor;
                        const pin = this.state.pin;
                        this.setState({showPinDialog: false, pin: '', pinFor: ''}, () =>
                            this.onPair(deviceId, pin));
                    }}
                >{I18n.t('Pair')}</Button>
                <Button
                    color="grey"
                    variant="contained"
                    onClick={() => this.setState({showPinDialog: false, pin: '', pinFor: ''})}
                >{I18n.t('Close')}</Button>
            </DialogActions>
        </Dialog>;
    }

    renderSureDialog() {
        return <Dialog
            open={this.state.showSureDialog}
            onClose={() => this.setState({showSureDialog: false, pinFor: ''})}
        >
            <DialogTitle>{I18n.t('Please confirm')}</DialogTitle>
            <DialogContent>
                {I18n.t('Are you sure?')}
            </DialogContent>
            <DialogActions>
                <Button
                    variant="contained"
                    color="primary"
                    onClick={()=> {
                        const deviceId = this.state.pinFor;
                        this.setState({showSureDialog: false, pinFor: ''}, () =>
                            this.onUnpair(deviceId));
                    }}
                >{I18n.t('Unpair')}</Button>
                <Button
                    color="grey"
                    autoFocus
                    variant="contained"
                    onClick={() => this.setState({showSureDialog: false, pinFor: ''})}
                >{I18n.t('Cancel')}</Button>
            </DialogActions>
        </Dialog>;
    }

    render() {
        if (this.state.loading && this.state.alive) {
            return <CircularProgress />;
        }
        return <Paper className={this.props.classes.tab}>
            {this.state.alive && this.renderTable()}
            {this.state.alive ? null : <div className={this.props.classes.notAlive}>{I18n.t('Instance must be started to set up the devices')}</div>}
            {this.state.alive ? null : <Button className={this.props.classes.startButton} variant="contained" color="primary" onClick={() => {
                this.props.socket.setState(this.aliveID, true);
            }} iconStart={<IconPlay />}>{I18n.t('Start?')}</Button>}
            {this.renderMessage()}
            {this.showPopper()}
            {this.renderPinDialog()}
            {this.renderSureDialog()}
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
