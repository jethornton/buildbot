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

import {observer} from "mobx-react";
import {useContext, useState} from "react";
import {useDataAccessor, useDataApiDynamicQuery, useDataApiQuery} from "../../data/ReactUtils";
import {Builder} from "../../data/classes/Builder";
import {Worker} from "../../data/classes/Worker";
import {globalMenuSettings} from "../../plugins/GlobalMenuSettings";
import {globalRoutes} from "../../plugins/GlobalRoutes";
import {Link, URLSearchParamsInit, useSearchParams} from "react-router-dom";
import {Master} from "../../data/classes/Master";
import {Build} from "../../data/classes/Build";
import {computed} from "mobx";
import DataCollection from "../../data/DataCollection";
import {useTopbarItems} from "../../stores/TopbarStore";
import {StoresContext} from "../../contexts/Stores";
import BuildLinkWithSummaryTooltip
  from "../../components/BuildLinkWithSummaryTooltip/BuildLinkWithSummaryTooltip";
import {globalSettings} from "../../plugins/GlobalSettings";

const connected2class = (worker: Worker) => {
  if (worker.connected_to.length > 0) {
    return "worker_CONNECTED";
  } else {
    return "worker_DISCONNECTED";
  }
};

const hasActiveMaster = (builder: Builder, masters: DataCollection<Master>) => {
  if ((builder.masterids == null)) {
    return false;
  }
  let active = false;
  for (let mid of builder.masterids) {
    const m = masters.getByIdOrNull(mid);
    if (m !== null && m.active) {
      active = true;
    }
  }
  if (builder.tags.includes('_virtual_')) {
    active = true;
  }
  return active;
};

const isBuilderFiltered = (builder: Builder, tags: string[], masters: DataCollection<Master>,
                           showOldBuilders: boolean) => {
  if (!showOldBuilders && !hasActiveMaster(builder, masters)) {
    return false;
  }

  const pluses = tags.filter(tag => tag.indexOf("+") === 0);
  const minuses = tags.filter(tag => tag.indexOf("-") === 0);

  // First enforce that we have no tag marked '-'
  for (const tag of minuses) {
    if (builder.tags.indexOf(tag.slice(1)) >= 0) {
      return false;
    }
  }

  // if only minuses or no filter
  if (tags.length === minuses.length) {
    return true;
  }

  // Then enforce that we have all the tags marked '+'
  for (const tag of pluses) {
    if (builder.tags.indexOf(tag.slice(1)) < 0) {
      return false;
    }
  }

  // Then enforce that we have at least one of the tag (marked '+' or not)
  for (let tag of tags) {
    if (tag.indexOf("+") === 0) {
      tag = tag.slice(1);
    }
    if (builder.tags.indexOf(tag) >= 0) {
      return true;
    }
  }
  return false;
};

const isTagFiltered = (tags: string[], tag: string) => {
  return (
    (tags.length === 0) ||
    (tags.indexOf(tag) >= 0) ||
    (tags.indexOf(`+${tag}`) >= 0) ||
    (tags.indexOf(`-${tag}`) >= 0)
  );
}

const setTags = (tags: string[], searchParams: URLSearchParams,
                 setSearchParams: (nextInit: URLSearchParamsInit) => void) => {
  const newParams = new URLSearchParams([...searchParams.entries()]);
  newParams.delete("tags");
  for (const tag of tags) {
    newParams.append("tags", tag);
  }
  setSearchParams(newParams);
}

const toggleTag = (tags: string[], tag: string, searchParams: URLSearchParams,
                   setSearchParams: (nextInit: URLSearchParamsInit) => void) => {
  if (tag.indexOf('+') === 0) {
    tag = tag.slice(1);
  }
  if (tag.indexOf('-') === 0) {
    tag = tag.slice(1);
  }

  const i = tags.indexOf(tag);
  const iplus = tags.indexOf(`+${tag}`);
  const iminus = tags.indexOf(`-${tag}`);

  const newTags = [...tags];
  if ((i < 0) && (iplus < 0) && (iminus < 0)) {
    newTags.push(`+${tag}`);
  } else if (iplus >= 0) {
    newTags.splice(iplus, 1);
    newTags.push(`-${tag}`);
  } else if (iminus >= 0) {
    newTags.splice(iminus, 1);
    newTags.push(tag);
  } else {
    newTags.splice(i, 1);
  }

  setTags(newTags, searchParams, setSearchParams);
};

const BuildersView = observer(() => {
  const stores = useContext(StoresContext);
  const accessor = useDataAccessor();

  const [searchParams, setSearchParams] = useSearchParams();

  const tags = searchParams.getAll("tags");
  const [builderNameFilter, setBuilderNameFilter] = useState("");

  useTopbarItems(stores.topbar, [
    {caption: "Builders", route: "/builders"}
  ]);

  const showOldBuilders = globalSettings.getBooleanSetting("Builders.show_old_builders");
  const showWorkerName = globalSettings.getBooleanSetting("Builders.show_workers_name");
  const buildFetchLimit = globalSettings.getIntegerSetting("Builders.buildFetchLimit");
  const perBuilderBuildFetchLimit = 15;

  // as there is usually lots of builders, its better to get the overall
  // list of workers, masters, and builds and then associate by builder
  const builders = useDataApiQuery(() => Builder.getAll(accessor));
  const masters = useDataApiQuery(() => Master.getAll(accessor));
  const workers = useDataApiQuery(() => Worker.getAll(accessor));

  const filteredBuilders = builders.array.filter(builder => {
    return isBuilderFiltered(builder, tags, masters, showOldBuilders) &&
      (builderNameFilter === null || builder.name.indexOf(builderNameFilter) >= 0)
  }).sort((a, b) => a.name.localeCompare(b.name));

  const filteredBuilderIds = filteredBuilders.map(builder => builder.builderid);

  const buildsForFilteredBuilders = useDataApiDynamicQuery(filteredBuilderIds,
    () => {
      // Don't request builds when we haven't loaded builders yet
      if (filteredBuilderIds.length === 0) {
        return new DataCollection<Build>();
      }
      return Build.getAll(accessor, {query: {
          limit: buildFetchLimit,
          order: '-started_at',
          builderid__eq: filteredBuilderIds
        }})
    });

  const buildsByFilteredBuilder = computed(() => {
    const byBuilderId: {[builderid: string]: Build[]} = {};
    for (const build of buildsForFilteredBuilders.array) {
      const builderid = build.builderid.toString();
      if (builderid in byBuilderId) {
        byBuilderId[builderid].push(build);
      } else {
        byBuilderId[builderid] = [build];
      }
    }
    return byBuilderId;
  }).get();

  const workersByFilteredBuilder = computed(() => {
    const byBuilderId: {[builderid: string]: Worker[]} = {};
    for (const worker of workers.array) {
      for (const configured_on of worker.configured_on) {
        const builderid = configured_on.builderid.toString();
        if (builderid in byBuilderId) {
          byBuilderId[builderid].push(worker);
        } else {
          byBuilderId[builderid] = [worker];
        }
      }
    }
    return byBuilderId;
  }).get();

  const [showTagHelp, setShowTagHelp] = useState(false);
  const tagHelpElement = (
    <span onClick={() => setShowTagHelp(!showTagHelp)}>
      <i style={{position: "relative"}} className="fa fa-question-circle clickable">
        {showTagHelp
          ? <div style={{display: "block", minWidth: "600px", left:"-300px", top: "30px"}}
                 className="popover bottom anim-popover">
              <h5 className="popover-title">Tags filtering</h5>
              <div className="popover-content">
                <p><b>
                  <pre>+{"{tag}"}</pre></b>all tags with '+' must be present in the builder tags</p>
                <p><b>
                  <pre>-{"{tag}"}</pre></b>no tags with '-' must be present in the builder tags</p>
                <p><b>
                  <pre>{"{tag}"}</pre></b>at least one of the filtered tag should be present</p>
                <p>url bar is updated with you filter configuration, so you can bookmark your filters!</p>
              </div>
              <div className="arrow"></div>
            </div>
          : <></>
        }
      </i>
    </span>
  );

  const enabledTagsElements: JSX.Element[] = [];
  if (tags.length === 0) {
    enabledTagsElements.push((
      <span>Tags</span>
    ));
  }
  if (tags.length < 5) {
    for (const tag of tags) {
      enabledTagsElements.push((
        <span>
          <span onClick={() => toggleTag(tags, tag, searchParams, setSearchParams)}
                className="label label-success">{tag}</span>&nbsp;
        </span>
      ));
    }
  } else {
    enabledTagsElements.push((
      <span>
        <span className="label label-success">{tags.length} tags</span>
      </span>
    ));
  }
  if (tags.length > 0) {
    enabledTagsElements.push((
      <span>
        <span onClick={() => setTags([], searchParams, setSearchParams)}
              className="label clickable label-danger">x</span>
      </span>
    ));
  }

  const builderRowElements = filteredBuilders.map(builder => {

    let buildElements: JSX.Element[] = [];
    if (builder.id in buildsByFilteredBuilder) {
      let builds = [...buildsByFilteredBuilder[builder.id]];
      builds = builds
        .sort((a, b) => a.number - b.number)
        .slice(0, perBuilderBuildFetchLimit);

      buildElements = builds.map(build => (<BuildLinkWithSummaryTooltip build={build}/>));
    }

    const tagElements = builder.tags.map(tag => {
      return (
        <span>
          <span onClick={() => toggleTag(tags, tag, searchParams, setSearchParams)}
                className={"label clickable " +
                  (isTagFiltered(tags, tag) ? 'label-success': 'label-default')}>
              {tag}
            </span>
          &nbsp;
          </span>
      );
    });

    let workerElements: JSX.Element[] = [];
    if (builder.id in workersByFilteredBuilder) {
      let workers = [...workersByFilteredBuilder[builder.id]];
      workers.sort((a, b) => a.name.localeCompare(b.name));
      workerElements = workers.map(worker => {

        const shownWorkerName = () => (
          <span title={worker.name} className={"badge-status " + connected2class(worker)}>
            {worker.name}
          </span>
        );

        const hoverWorkerName = () => (
          <span title={worker.name}
                className={"badge-status " + connected2class(worker)}>
              <div className="badge-inactive">{worker.workerid}</div>
              <div className="badge-active">{worker.name}</div>
            </span>
        );

        return (
          <span>
            <Link to={`/workers/${worker.id}`}>
              {showWorkerName ? shownWorkerName() : hoverWorkerName()}
             </Link>
          </span>
        );
      })
    }

    return (
      <tr key={builder.name}>
        <td style={{width: "200px"}}>
          <Link to={`/builders/${builder.builderid}`}>{builder.name}</Link></td>
        <td>
          {buildElements}
        </td>
        <td style={{width: "20%"}}>
          {tagElements}
        </td>
        <td style={{width: "20%"}}>
          {workerElements}
        </td>
      </tr>
    );
  });

  // FIXME: implement pagination
  return (
    <div className="container">
      <div className="row">
        <form role="search" style={{width: "150px"}}>
          <input type="text" value={builderNameFilter}
                 onChange={e => setBuilderNameFilter(e.target.value)}
                 placeholder="Search for builders" className="form-control"/>
        </form>
        <table className="table table-hover table-striped table-condensed">
          <tbody>
            <tr>
              <th>Builder Name</th>
              <th>Builds</th>
              <th>
                {tagHelpElement}
                {enabledTagsElements}
              </th>
              <th style={{width: "20%px"}}>Workers</th>
            </tr>
            {builderRowElements}
          </tbody>
        </table>
      </div>
    </div>
  );

  // FIXME: show old builders setting form
});

globalMenuSettings.addGroup({
  name: 'builds',
  parentName: null,
  caption: 'Builds',
  icon: 'cogs',
  order: 10,
  route: null,
});

globalMenuSettings.addGroup({
  name: 'builders',
  parentName: 'builds',
  caption: 'Builders',
  icon: null,
  order: null,
  route: '/builders',
});

globalRoutes.addRoute({
  route: "builders",
  group: "builders",
  element: () => <BuildersView/>,
});

globalSettings.addGroup({
  name: 'Builders',
  caption: 'Builders page related settings',
  items: [{
      type: 'boolean',
      name: 'show_old_builders',
      caption: 'Show old builders',
      defaultValue: false
    }, {
      type: 'boolean',
      name: 'show_workers_name',
      caption: 'Show workers name',
      defaultValue: false
    }, {
      type: 'integer',
      name: 'buildFetchLimit',
      caption: 'Maximum number of builds to fetch',
      defaultValue: 200
    }, {
      type:'integer',
      name:'page_size',
      caption:'Number of builders to show per page',
      defaultValue: 100
    }
  ]});

export default BuildersView;
