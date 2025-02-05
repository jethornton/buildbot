/*
  This file is part of Buildbot.  Buildbot is free software: you can
  redistribute it and/or modify it under the terms of the GNU General Public
  License as published by the Free Software Foundation, version 2.

  This program is distributed in the hope that it will be useful, but WITHOUT
  ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS
  FOR A PARTICULAR PURPOSE.  See the GNU General Public License for more
  details.

  You should have received a copy of the GNU General Public License along with
  this program; if not, write to the Free Software Foundation, Inc., 51
  Franklin Street, Fifth Floor, Boston, MA 02110-1301 USA.

  Copyright Buildbot Team Members
*/

import './PageWithSidebar.less';
import {observer} from "mobx-react";
import {GlobalMenuSettings} from "../../plugins/GlobalMenuSettings";
import SidebarStore from "../../stores/SidebarStore";
import {Link} from "react-router-dom";

type PageWithSidebarProps = {
  menuSettings: GlobalMenuSettings,
  sidebarStore: SidebarStore,
  children: JSX.Element[] | JSX.Element,
}

const PageWithSidebar = observer(({menuSettings, sidebarStore, children}: PageWithSidebarProps) => {
  const {appTitle, groups, footerItems} = menuSettings;

  const pageWithSidebarClass = "gl-page-with-sidebar" +
    (sidebarStore.active ? " active": "") +
    (sidebarStore.pinned ? " pinned": "");

  let sidebarIcon: JSX.Element;
  if (sidebarStore.active) {
    sidebarIcon = (
      <span onClick={() => sidebarStore.togglePinned()}
            className={"menu-icon fa fa-thumb-tack" + (sidebarStore.pinned ? "" : " fa-45")}/>
    );
  } else {
    sidebarIcon = (
      <span onClick={() => sidebarStore.show()} className="menu-icon fa fa-bars"/>
    );
  }

  const groupElements = groups.map((group, groupIndex) => {
    if (group.subGroups.length > 0) {
      const subGroups = group.subGroups.map(subGroup => {
          const subClassName = "sidebar-list subitem" +
            (sidebarStore.activeGroup === group.name ? " active": "");

          return (
            <li key={subGroup.name} className={subClassName}>
              {subGroup.route === null
                ? <span>{subGroup.caption}</span>
                : <Link to={subGroup.route} onClick={() => sidebarStore.hide()}>{subGroup.caption}</Link>
              }
            </li>
          )
        });

      return (
        <div key={group.name}>
          <div>
            <li className="sidebar-list">
              <a onClick={() => {sidebarStore.toggleGroup(group.name); }}>
                <i className="fa fa-angle-right"></i>&nbsp;{group.caption}
                <span className={"menu-icon fa fa-" + group.icon}></span>
              </a>
            </li>
            {subGroups}
          </div>
        </div>
      );
    }

    return (
      <div key={group.name}>
        <div>
          <div>
            {groupIndex > 0 ? <li className="sidebar-separator"></li> : <></>}
            <li className="sidebar-list">
              {group.route === null
                ? <a onClick={() => sidebarStore.toggleGroup(group.name)}>{group.caption}
                    <span className={"menu-icon fa fa-" + group.icon}></span>
                  </a>
                : <Link to={group.route} onClick={() => sidebarStore.toggleGroup(group.name)}>{group.caption}
                    <span className={"menu-icon fa fa-" + group.icon}></span>
                  </Link>
              }
            </li>
          </div>
        </div>
      </div>
    );
  });

  const footerElements = footerItems.map(footerItem => {
    return (
      <div className="col-xs-4">
        <Link to={footerItem.route}>{footerItem.caption}</Link>
      </div>
    );
  });

  // TODO: a href javascript:
  return (
    <div className={pageWithSidebarClass}>
      <div onMouseEnter={() => sidebarStore.enter()} onMouseLeave={() => sidebarStore.leave()}
           onClick={() => sidebarStore.show()} className="sidebar sidebar-blue">
        <ul>
          <li className="sidebar-main"><a href="javascript:">{appTitle}{sidebarIcon}</a></li>
          <li className="sidebar-title"><span>NAVIGATION</span></li>
          {groupElements}
        </ul>
        <div className="sidebar-footer">
          {footerElements}
        </div>
      </div>
      <div className="content">
        {children}
      </div>
    </div>
  );
});

export default PageWithSidebar;
