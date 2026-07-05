// SPDX-License-Identifier: AGPL-3.0-or-later

use crate::types::{UserRequest, UserResponse};
use fluxer_svc::router::RouterService;
use moka::sync::Cache;
use std::time::Duration;

pub struct UsersRouter {
    l1: Cache<String, UserResponse>,
}

impl UsersRouter {
    pub fn new(max_entries: u64, ttl: Duration) -> Self {
        Self {
            l1: Cache::builder()
                .max_capacity(max_entries)
                .time_to_live(ttl)
                .build(),
        }
    }
}

impl RouterService for UsersRouter {
    type Request = UserRequest;
    type Response = UserResponse;

    fn service_name(&self) -> &str {
        "users"
    }

    fn route_key(req: &UserRequest) -> String {
        match req {
            UserRequest::GetById { user_id } => user_id.to_string(),
            UserRequest::GetPartialById { user_id } => user_id.to_string(),
            UserRequest::GetPartialsByIds { user_ids } => user_ids
                .iter()
                .min()
                .map(ToString::to_string)
                .unwrap_or_else(|| "0".to_owned()),
            UserRequest::GetApiPartialById { user_id } => user_id.clone(),
            UserRequest::GetApiPartialsByIds { user_ids } => user_ids
                .iter()
                .min()
                .cloned()
                .unwrap_or_else(|| "0".to_owned()),
            UserRequest::Invalidate { user_id } => user_id.to_string(),
        }
    }

    fn coalesce_key(req: &UserRequest) -> Option<String> {
        match req {
            UserRequest::GetById { user_id } => Some(format!("get:{user_id}")),
            UserRequest::GetPartialById { user_id } => Some(format!("partial:{user_id}")),
            UserRequest::GetPartialsByIds { user_ids } => {
                let mut ids = user_ids.clone();
                ids.sort_unstable();
                ids.dedup();
                Some(format!(
                    "partials:{}",
                    ids.iter()
                        .map(ToString::to_string)
                        .collect::<Vec<_>>()
                        .join(",")
                ))
            }
            UserRequest::GetApiPartialById { user_id } => Some(format!("api_partial:{user_id}")),
            UserRequest::GetApiPartialsByIds { user_ids } => {
                let mut ids = user_ids.clone();
                ids.sort_unstable();
                ids.dedup();
                Some(format!("api_partials:{}", ids.join(",")))
            }
            UserRequest::Invalidate { .. } => None,
        }
    }

    fn l1_lookup(&self, req: &UserRequest) -> Option<UserResponse> {
        match req {
            UserRequest::GetById { user_id } => self.l1.get(&user_id.to_string()),
            UserRequest::GetPartialById { user_id } => {
                let cached = self.l1.get(&user_id.to_string())?;
                match cached {
                    UserResponse::Found(ref user) => {
                        Some(UserResponse::FoundPartial(user.to_partial()))
                    }
                    UserResponse::FoundPartial(_) => Some(cached),
                    UserResponse::NotFound => Some(UserResponse::NotFound),
                    _ => None,
                }
            }
            UserRequest::GetPartialsByIds { user_ids } => {
                let mut partials = Vec::with_capacity(user_ids.len());
                for user_id in user_ids {
                    let cached = self.l1.get(&user_id.to_string())?;
                    match cached {
                        UserResponse::Found(ref user) => partials.push(user.to_partial()),
                        UserResponse::FoundPartial(partial) => partials.push(partial),
                        UserResponse::NotFound => {}
                        _ => return None,
                    }
                }
                Some(UserResponse::FoundPartials(partials))
            }
            UserRequest::GetApiPartialById { user_id } => {
                let cached = self.l1.get(user_id)?;
                match cached {
                    UserResponse::Found(ref user) => {
                        Some(UserResponse::FoundApiPartial(user.to_api_partial()))
                    }
                    UserResponse::FoundPartial(ref partial) => {
                        Some(UserResponse::FoundApiPartial(partial.to_api_partial()))
                    }
                    UserResponse::FoundApiPartial(partial) => {
                        Some(UserResponse::FoundApiPartial(partial))
                    }
                    UserResponse::NotFound => Some(UserResponse::NotFound),
                    _ => None,
                }
            }
            UserRequest::GetApiPartialsByIds { user_ids } => {
                let mut partials = Vec::with_capacity(user_ids.len());
                for user_id in user_ids {
                    let cached = self.l1.get(user_id)?;
                    match cached {
                        UserResponse::Found(ref user) => partials.push(user.to_api_partial()),
                        UserResponse::FoundPartial(ref partial) => {
                            partials.push(partial.to_api_partial())
                        }
                        UserResponse::FoundApiPartial(partial) => partials.push(partial),
                        UserResponse::NotFound => {}
                        _ => return None,
                    }
                }
                Some(UserResponse::FoundApiPartials(partials))
            }
            UserRequest::Invalidate { .. } => None,
        }
    }

    fn l1_insert(&self, req: &UserRequest, resp: &UserResponse) {
        match req {
            UserRequest::GetById { user_id } => {
                self.l1.insert(user_id.to_string(), resp.clone());
            }
            UserRequest::GetPartialById { user_id } => {
                if !matches!(
                    self.l1.get(&user_id.to_string()),
                    Some(UserResponse::Found(_))
                ) {
                    self.l1.insert(user_id.to_string(), resp.clone());
                }
            }
            UserRequest::GetPartialsByIds { .. } => {
                if let UserResponse::FoundPartials(partials) = resp {
                    for partial in partials {
                        let key = partial.user_id.to_string();
                        if !matches!(self.l1.get(&key), Some(UserResponse::Found(_))) {
                            self.l1
                                .insert(key, UserResponse::FoundPartial(partial.clone()));
                        }
                    }
                }
            }
            UserRequest::GetApiPartialById { .. } => {
                if let UserResponse::FoundApiPartial(partial) = resp {
                    self.l1.insert(
                        partial.id.clone(),
                        UserResponse::FoundApiPartial(partial.clone()),
                    );
                }
            }
            UserRequest::GetApiPartialsByIds { .. } => {
                if let UserResponse::FoundApiPartials(partials) = resp {
                    for partial in partials {
                        self.l1.insert(
                            partial.id.clone(),
                            UserResponse::FoundApiPartial(partial.clone()),
                        );
                    }
                }
            }
            UserRequest::Invalidate { .. } => {}
        }
    }

    fn l1_invalidate(&self, key: &str) {
        self.l1.invalidate(key);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn api_partial(id: &str) -> crate::types::ApiUserPartial {
        crate::types::ApiUserPartial {
            id: id.to_owned(),
            username: "Ada".to_owned(),
            discriminator: "0007".to_owned(),
            global_name: Some("Ada Lovelace".to_owned()),
            avatar: Some("avatar_hash".to_owned()),
            avatar_color: Some(0x336699),
            bot: None,
            system: None,
            flags: 1,
            mention_flags: None,
        }
    }

    #[test]
    fn l1_caches_api_partial_batch_responses() {
        let router = UsersRouter::new(100, Duration::from_secs(30));
        let partial = api_partial("9223372036854775807");
        router.l1_insert(
            &UserRequest::GetApiPartialsByIds {
                user_ids: vec![partial.id.clone()],
            },
            &UserResponse::FoundApiPartials(vec![partial.clone()]),
        );

        let cached = router.l1_lookup(&UserRequest::GetApiPartialsByIds {
            user_ids: vec![partial.id.clone()],
        });

        match cached {
            Some(UserResponse::FoundApiPartials(partials)) => {
                assert_eq!(partials.len(), 1);
                assert_eq!(partials[0].id, partial.id);
                assert_eq!(partials[0].username, partial.username);
            }
            other => panic!("unexpected cached response: {other:?}"),
        }
    }

    #[test]
    fn l1_invalidates_cached_api_partials_by_user_id() {
        let router = UsersRouter::new(100, Duration::from_secs(30));
        let partial = api_partial("42");
        router.l1_insert(
            &UserRequest::GetApiPartialById {
                user_id: partial.id.clone(),
            },
            &UserResponse::FoundApiPartial(partial.clone()),
        );

        assert!(
            router
                .l1_lookup(&UserRequest::GetApiPartialById {
                    user_id: partial.id.clone(),
                })
                .is_some()
        );
        router.l1_invalidate(&partial.id);

        assert!(
            router
                .l1_lookup(&UserRequest::GetApiPartialById {
                    user_id: partial.id,
                })
                .is_none()
        );
    }
}
