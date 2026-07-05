//! Resource-oriented API surfaces. Each submodule groups endpoints by Fluxer resource.
//!
//! These types are constructed from a shared [`crate::http::Http`] handle held by
//! [`crate::FluxerClient`] and returned via accessor methods such as
//! `client.users()`, `client.guilds()`, etc.

pub mod channels;
pub mod discovery;
pub mod generated;
pub mod gifs;
pub mod guilds;
pub mod invites;
pub mod messages;
pub mod reactions;
pub mod reports;
pub mod search;
pub mod users;

use crate::http::Http;

/// A cheap handle that clones the shared [`Http`] and gives access to a resource API.
#[derive(Clone, Debug)]
pub struct Api(pub Http);

impl Api {
    pub fn users(&self) -> users::Users {
        users::Users(self.0.clone())
    }
    pub fn guilds(&self) -> guilds::Guilds {
        guilds::Guilds(self.0.clone())
    }
    pub fn invites(&self) -> invites::Invites {
        invites::Invites(self.0.clone())
    }
    pub fn channels(&self) -> channels::Channels {
        channels::Channels(self.0.clone())
    }
    pub fn messages(&self) -> messages::Messages {
        messages::Messages(self.0.clone())
    }
    pub fn reactions(&self) -> reactions::Reactions {
        reactions::Reactions(self.0.clone())
    }
    pub fn search(&self) -> search::Search {
        search::Search(self.0.clone())
    }
    pub fn reports(&self) -> reports::Reports {
        reports::Reports(self.0.clone())
    }
    pub fn gifs(&self) -> gifs::Gifs {
        gifs::Gifs(self.0.clone())
    }
    pub fn discovery(&self) -> discovery::Discovery {
        discovery::Discovery(self.0.clone())
    }
}
