# This file is part of Buildbot.  Buildbot is free software: you can
# redistribute it and/or modify it under the terms of the GNU General Public
# License as published by the Free Software Foundation, version 2.
#
# This program is distributed in the hope that it will be useful, but WITHOUT
# ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS
# FOR A PARTICULAR PURPOSE.  See the GNU General Public License for more
# details.
#
# You should have received a copy of the GNU General Public License along with
# this program; if not, write to the Free Software Foundation, Inc., 51
# Franklin Street, Fifth Floor, Boston, MA 02110-1301 USA.
#
# Copyright Buildbot Team Members

import mock

from buildbot import config
from buildbot import locks
from buildbot.test.fake import bslavemanager
from buildbot.test.fake import fakedb
from buildbot.test.fake import fakemaster
from buildbot.test.fake import fakeprotocol
from buildbot.test.fake import worker
from buildbot.test.util import interfaces
from buildbot.test.util.warnings import assertNotProducesWarnings
from buildbot.test.util.warnings import assertProducesWarning
from buildbot.test.util.warnings import ignoreWarning
from buildbot.worker import base
from buildbot.worker_transition import DeprecatedWorkerAPIWarning
from buildbot.worker_transition import DeprecatedWorkerModuleWarning
from buildbot.worker_transition import DeprecatedWorkerNameWarning
from twisted.internet import defer
from twisted.internet import reactor
from twisted.internet import task
from twisted.trial import unittest


class ConcreteWorker(base.AbstractWorker):
    pass


class BuildSlaveInterfaceTests(interfaces.InterfaceTests):

    def test_attr_workername(self):
        self.failUnless(hasattr(self.sl, 'workername'))

    def test_attr_properties(self):
        self.failUnless(hasattr(self.sl, 'properties'))

    @defer.inlineCallbacks
    def test_attr_slave_basedir(self):
        yield self.callAttached()
        self.assertIsInstance(self.sl.slave_basedir, str)

    @defer.inlineCallbacks
    def test_attr_path_module(self):
        yield self.callAttached()
        self.failUnless(hasattr(self.sl, 'path_module'))

    @defer.inlineCallbacks
    def test_attr_slave_system(self):
        yield self.callAttached()
        self.failUnless(hasattr(self.sl, 'slave_system'))

    def test_signature_acquireLocks(self):
        @self.assertArgSpecMatches(self.sl.acquireLocks)
        def acquireLocks(self):
            pass

    def test_signature_releaseLocks(self):
        @self.assertArgSpecMatches(self.sl.releaseLocks)
        def releaseLocks(self):
            pass

    def test_signature_attached(self):
        @self.assertArgSpecMatches(self.sl.attached)
        def attached(self, conn):
            pass

    def test_signature_detached(self):
        @self.assertArgSpecMatches(self.sl.detached)
        def detached(self):
            pass

    def test_signature_addSlaveBuilder(self):
        @self.assertArgSpecMatches(self.sl.addSlaveBuilder)
        def addSlaveBuilder(self, sb):
            pass

    def test_signature_removeSlaveBuilder(self):
        @self.assertArgSpecMatches(self.sl.removeSlaveBuilder)
        def removeSlaveBuilder(self, sb):
            pass

    def test_signature_buildFinished(self):
        @self.assertArgSpecMatches(self.sl.buildFinished)
        def buildFinished(self, sb):
            pass

    def test_signature_canStartBuild(self):
        @self.assertArgSpecMatches(self.sl.canStartBuild)
        def canStartBuild(self):
            pass


class RealBuildSlaveItfc(unittest.TestCase, BuildSlaveInterfaceTests):

    def setUp(self):
        self.sl = ConcreteWorker('sl', 'pa')

    def callAttached(self):
        self.master = fakemaster.make_master(testcase=self, wantData=True)
        self.master.workers.disownServiceParent()
        self.buildslaves = bslavemanager.FakeBuildslaveManager()
        self.buildslaves.setServiceParent(self.master)
        self.master.workers = self.buildslaves
        self.sl.setServiceParent(self.master.workers)
        self.conn = fakeprotocol.FakeConnection(self.master, self.sl)
        return self.sl.attached(self.conn)


class FakeBuildSlaveItfc(unittest.TestCase, BuildSlaveInterfaceTests):

    def setUp(self):
        self.master = fakemaster.make_master(testcase=self)
        self.sl = worker.FakeWorker(self.master)

    def callAttached(self):
        self.conn = fakeprotocol.FakeConnection(self.master, self.sl)
        return self.sl.attached(self.conn)


class TestAbstractBuildSlave(unittest.TestCase):

    def setUp(self):
        self.master = fakemaster.make_master(wantDb=True, wantData=True,
                                             testcase=self)
        self.botmaster = self.master.botmaster
        self.master.workers.disownServiceParent()
        self.buildslaves = self.master.workers = bslavemanager.FakeBuildslaveManager()
        self.buildslaves.setServiceParent(self.master)
        self.clock = task.Clock()
        self.patch(reactor, 'callLater', self.clock.callLater)
        self.patch(reactor, 'seconds', self.clock.seconds)

    def createBuildslave(self, name='bot', password='pass', attached=False, configured=True, **kwargs):
        slave = ConcreteWorker(name, password, **kwargs)
        if configured:
            slave.setServiceParent(self.buildslaves)
        if attached:
            slave.conn = fakeprotocol.FakeConnection(self.master, slave)
        return slave

    def test_constructor_minimal(self):
        bs = ConcreteWorker('bot', 'pass')
        self.assertEqual(bs.workername, 'bot')
        self.assertEqual(bs.password, 'pass')
        self.assertEqual(bs.max_builds, None)
        self.assertEqual(bs.notify_on_missing, [])
        self.assertEqual(bs.missing_timeout, 10 * 60)
        self.assertEqual(bs.properties.getProperty('slavename'), 'bot')
        self.assertEqual(bs.access, [])

    def test_workername_old_api(self):
        bs = ConcreteWorker('bot', 'pass')

        with assertProducesWarning(
                DeprecatedWorkerNameWarning,
                message_pattern="'slavename' attribute is deprecated"):
            old_name = bs.slavename

        with assertNotProducesWarnings(DeprecatedWorkerAPIWarning):
            name = bs.workername

        self.assertEqual(name, old_name)

    def test_constructor_full(self):
        lock1, lock2 = mock.Mock(name='lock1'), mock.Mock(name='lock2')
        bs = ConcreteWorker('bot', 'pass',
                            max_builds=2,
                            notify_on_missing=['me@me.com'],
                            missing_timeout=120,
                            properties={'a': 'b'},
                            locks=[lock1, lock2])

        self.assertEqual(bs.max_builds, 2)
        self.assertEqual(bs.notify_on_missing, ['me@me.com'])
        self.assertEqual(bs.missing_timeout, 120)
        self.assertEqual(bs.properties.getProperty('a'), 'b')
        self.assertEqual(bs.access, [lock1, lock2])

    def test_constructor_notify_on_missing_not_list(self):
        bs = ConcreteWorker('bot', 'pass',
                            notify_on_missing='foo@foo.com')
        # turned into a list:
        self.assertEqual(bs.notify_on_missing, ['foo@foo.com'])

    def test_constructor_notify_on_missing_not_string(self):
        self.assertRaises(config.ConfigErrors, lambda:
                          ConcreteWorker('bot', 'pass',
                                         notify_on_missing=['a@b.com', 13]))

    @defer.inlineCallbacks
    def do_test_reconfigService(self, old, new, existingRegistration=True):
        old.parent = self.master
        if existingRegistration:
            old.registration = bslavemanager.FakeWorkerRegistration(old)
        old.missing_timer = mock.Mock(name='missing_timer')
        yield old.startService()

        yield old.reconfigServiceWithSibling(new)

    @defer.inlineCallbacks
    def test_reconfigService_attrs(self):
        old = self.createBuildslave('bot', 'pass',
                                    max_builds=2,
                                    notify_on_missing=['me@me.com'],
                                    missing_timeout=120,
                                    properties={'a': 'b'})
        new = self.createBuildslave('bot', 'pass', configured=False,
                                    max_builds=3,
                                    notify_on_missing=['her@me.com'],
                                    missing_timeout=121,
                                    properties={'a': 'c'})

        old.updateWorker = mock.Mock(side_effect=lambda: defer.succeed(None))

        yield self.do_test_reconfigService(old, new)

        self.assertEqual(old.max_builds, 3)
        self.assertEqual(old.notify_on_missing, ['her@me.com'])
        self.assertEqual(old.missing_timeout, 121)
        self.assertEqual(old.properties.getProperty('a'), 'c')
        self.assertEqual(old.registration.updates, ['bot'])
        self.assertTrue(old.updateWorker.called)

    @defer.inlineCallbacks
    def test_reconfigService_has_properties(self):
        old = self.createBuildslave(name="bot", password="pass")

        yield self.do_test_reconfigService(old, old)
        self.assertTrue(old.properties.getProperty('slavename'), 'bot')

    @defer.inlineCallbacks
    def test_reconfigService_initial_registration(self):
        old = self.createBuildslave('bot', 'pass')
        yield self.do_test_reconfigService(old, old,
                                           existingRegistration=False)
        self.assertIn('bot', self.master.workers.registrations)
        self.assertEqual(old.registration.updates, ['bot'])

    @defer.inlineCallbacks
    def test_stopService(self):
        slave = self.createBuildslave()
        yield slave.startService()

        reg = slave.registration

        yield slave.stopService()

        self.assertTrue(reg.unregistered)
        self.assertEqual(slave.registration, None)

    # FIXME: Test that reconfig properly deals with
    #   1) locks
    #   2) telling worker about builder
    #   3) missing timer
    # in both the initial config and a reconfiguration.

    def test_startMissingTimer_no_parent(self):
        bs = ConcreteWorker('bot', 'pass',
                            notify_on_missing=['abc'],
                            missing_timeout=10)
        bs.startMissingTimer()
        self.assertEqual(bs.missing_timer, None)

    def test_startMissingTimer_no_timeout(self):
        bs = ConcreteWorker('bot', 'pass',
                            notify_on_missing=['abc'],
                            missing_timeout=0)
        bs.parent = mock.Mock()
        bs.startMissingTimer()
        self.assertEqual(bs.missing_timer, None)

    def test_startMissingTimer_no_notify(self):
        bs = ConcreteWorker('bot', 'pass',
                            missing_timeout=3600)
        bs.parent = mock.Mock()
        bs.startMissingTimer()
        self.assertEqual(bs.missing_timer, None)

    def test_missing_timer(self):
        bs = ConcreteWorker('bot', 'pass',
                            notify_on_missing=['abc'],
                            missing_timeout=100)
        bs.parent = mock.Mock()
        bs.startMissingTimer()
        self.assertNotEqual(bs.missing_timer, None)
        bs.stopMissingTimer()
        self.assertEqual(bs.missing_timer, None)

    @defer.inlineCallbacks
    def test_setServiceParent_started(self):
        master = self.master
        bsmanager = master.workers
        yield master.startService()
        bs = ConcreteWorker('bot', 'pass')
        bs.setServiceParent(bsmanager)
        self.assertEqual(bs.manager, bsmanager)
        self.assertEqual(bs.parent, bsmanager)
        self.assertEqual(bsmanager.master, master)
        self.assertEqual(bs.master, master)

    @defer.inlineCallbacks
    def test_setServiceParent_masterLocks(self):
        """
        http://trac.buildbot.net/ticket/2278
        """
        master = self.master
        bsmanager = master.workers
        yield master.startService()
        lock = locks.MasterLock('masterlock')
        bs = ConcreteWorker('bot', 'pass', locks=[lock.access("counting")])
        bs.setServiceParent(bsmanager)

    @defer.inlineCallbacks
    def test_setServiceParent_slaveLocks(self):
        """
        http://trac.buildbot.net/ticket/2278
        """
        master = self.master
        bsmanager = master.workers
        yield master.startService()
        lock = locks.SlaveLock('lock')
        bs = ConcreteWorker('bot', 'pass', locks=[lock.access("counting")])
        bs.setServiceParent(bsmanager)

    @defer.inlineCallbacks
    def test_startService_getSlaveInfo_empty(self):
        slave = self.createBuildslave()
        yield slave.startService()

        self.assertEqual(slave.worker_status.getAdmin(), None)
        self.assertEqual(slave.worker_status.getHost(), None)
        self.assertEqual(slave.worker_status.getAccessURI(), None)
        self.assertEqual(slave.worker_status.getVersion(), None)

        # check that a new worker row was added for this buildslave
        bs = yield self.master.db.buildslaves.getBuildslave(name='bot')
        self.assertEqual(bs['name'], 'bot')

    @defer.inlineCallbacks
    def test_startService_getSlaveInfo_fromDb(self):
        self.master.db.insertTestData([
            fakedb.Buildslave(id=9292, name='bot', info={
                'admin': 'TheAdmin',
                'host': 'TheHost',
                'access_uri': 'TheURI',
                'version': 'TheVersion'
            })
        ])
        slave = self.createBuildslave()

        yield slave.startService()

        self.assertEqual(slave.buildslaveid, 9292)
        self.assertEqual(slave.worker_status.getAdmin(), 'TheAdmin')
        self.assertEqual(slave.worker_status.getHost(), 'TheHost')
        self.assertEqual(slave.worker_status.getAccessURI(), 'TheURI')
        self.assertEqual(slave.worker_status.getVersion(), 'TheVersion')

    @defer.inlineCallbacks
    def test_attached_remoteGetSlaveInfo(self):
        slave = self.createBuildslave()
        yield slave.startService()

        ENVIRON = {}
        COMMANDS = {'cmd1': '1', 'cmd2': '1'}

        conn = fakeprotocol.FakeConnection(slave.master, slave)
        conn.info = {
            'admin': 'TheAdmin',
            'host': 'TheHost',
            'access_uri': 'TheURI',
            'environ': ENVIRON,
            'basedir': 'TheBaseDir',
            'system': 'TheSlaveSystem',
            'version': 'version',
            'slave_commands': COMMANDS,
        }
        yield slave.attached(conn)

        # check the values get set right
        self.assertEqual(slave.worker_status.getAdmin(), "TheAdmin")
        self.assertEqual(slave.worker_status.getHost(), "TheHost")
        self.assertEqual(slave.worker_status.getAccessURI(), "TheURI")
        self.assertEqual(slave.slave_environ, ENVIRON)
        self.assertEqual(slave.slave_basedir, 'TheBaseDir')
        self.assertEqual(slave.slave_system, 'TheSlaveSystem')
        self.assertEqual(slave.slave_commands, COMMANDS)

    @defer.inlineCallbacks
    def test_attached_callsMaybeStartBuildsForSlave(self):
        slave = self.createBuildslave()
        yield slave.startService()
        yield slave.reconfigServiceWithSibling(slave)

        conn = fakeprotocol.FakeConnection(slave.master, slave)
        conn.info = {}
        yield slave.attached(conn)

        self.assertEqual(self.botmaster.buildsStartedForSlaves, ["bot"])

    @defer.inlineCallbacks
    def test_attached_slaveInfoUpdates(self):
        # put in stale info:
        self.master.db.insertTestData([
            fakedb.Buildslave(name='bot', info={
                'admin': 'WrongAdmin',
                'host': 'WrongHost',
                'access_uri': 'WrongURI',
                'version': 'WrongVersion'
            })
        ])
        slave = self.createBuildslave()
        yield slave.startService()

        conn = fakeprotocol.FakeConnection(slave.master, slave)
        conn.info = {
            'admin': 'TheAdmin',
            'host': 'TheHost',
            'access_uri': 'TheURI',
            'version': 'TheVersion',
        }
        yield slave.attached(conn)

        self.assertEqual(slave.worker_status.getAdmin(), 'TheAdmin')
        self.assertEqual(slave.worker_status.getHost(), 'TheHost')
        self.assertEqual(slave.worker_status.getAccessURI(), 'TheURI')
        self.assertEqual(slave.worker_status.getVersion(), 'TheVersion')

        # and the db is updated too:
        buildslave = yield self.master.db.buildslaves.getBuildslave(name="bot")

        self.assertEqual(buildslave['slaveinfo']['admin'], 'TheAdmin')
        self.assertEqual(buildslave['slaveinfo']['host'], 'TheHost')
        self.assertEqual(buildslave['slaveinfo']['access_uri'], 'TheURI')
        self.assertEqual(buildslave['slaveinfo']['version'], 'TheVersion')

    @defer.inlineCallbacks
    def test_slave_shutdown(self):
        slave = self.createBuildslave(attached=True)
        yield slave.startService()

        yield slave.shutdown()
        self.assertEqual(slave.conn.remoteCalls, [('remoteSetBuilderList', []), ('remoteShutdown',)])

    @defer.inlineCallbacks
    def test_slave_shutdown_not_connected(self):
        slave = self.createBuildslave(attached=False)
        yield slave.startService()

        # No exceptions should be raised here
        yield slave.shutdown()

    @defer.inlineCallbacks
    def test_shutdownRequested(self):
        slave = self.createBuildslave(attached=False)
        yield slave.startService()

        yield slave.shutdownRequested()
        self.assertEqual(slave.worker_status.getGraceful(), True)


class TestWorkerTransition(unittest.TestCase):

    def test_abstract_worker(self):
        from buildbot.worker import AbstractWorker
        with ignoreWarning(DeprecatedWorkerModuleWarning):
            from buildbot.buildslave import AbstractBuildSlave

        class Worker(AbstractBuildSlave):

            def __init__(self):
                pass

        with assertProducesWarning(
                DeprecatedWorkerNameWarning,
                message_pattern="'AbstractBuildSlave' class "
                                "is deprecated"):
            w = Worker()
            self.assertIsInstance(w, AbstractWorker)

    def test_abstract_latent_worker(self):
        from buildbot.worker import AbstractLatentWorker
        with ignoreWarning(DeprecatedWorkerModuleWarning):
            from buildbot.buildslave import AbstractLatentBuildSlave

        class Worker(AbstractLatentBuildSlave):

            def __init__(self):
                pass

        with assertProducesWarning(
                DeprecatedWorkerNameWarning,
                message_pattern="'AbstractLatentBuildSlave' class "
                                "is deprecated"):
            w = Worker()
            self.assertIsInstance(w, AbstractLatentWorker)

    def test_worker(self):
        from buildbot.worker import Worker
        with ignoreWarning(DeprecatedWorkerModuleWarning):
            from buildbot.buildslave import BuildSlave

        class CustomWorker(BuildSlave):

            def __init__(self):
                pass

        with assertProducesWarning(
                DeprecatedWorkerNameWarning,
                message_pattern="'BuildSlave' class is deprecated"):
            w = CustomWorker()
            self.assertIsInstance(w, Worker)
