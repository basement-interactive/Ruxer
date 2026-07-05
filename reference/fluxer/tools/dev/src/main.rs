// SPDX-License-Identifier: AGPL-3.0-or-later

use anyhow::Result;
use clap::{Args, Parser, Subcommand};
use fluxer_dev::cassandra::{
    apply_schema, compute_diff, render_target_schema, verify_schema, write_diff_file,
};
use fluxer_dev::desktop::{
    build_desktop, install_desktop, package_desktop, run_desktop, run_desktop_canary,
    smoke_build_desktop, typecheck_desktop,
};
use fluxer_dev::env::merge_default_env_with_current;
use fluxer_dev::manifest::{DEV_PROXY_PORT, LOCAL_APP_URL};
use fluxer_dev::paths::{DEV_ENV_FILE, DEV_LOCAL_ENV_FILE, ROOT_LOCAL_ENV_FILE};
use std::collections::BTreeMap;
use std::path::PathBuf;

#[derive(Debug, Parser)]
#[command(name = "fluxer-dev")]
struct Cli {
    #[command(subcommand)]
    command: Command,
}

#[derive(Debug, Subcommand)]
enum Command {
    Bootstrap(BootstrapArgs),
    PostStart,
    Gateway(GatewayArgs),
    Build,
    Knip,
    Test,
    Typecheck,
    Proxy(ProxyArgs),
    Dev(DevArgs),
    RustServices(RustServicesArgs),
    Smoke(SmokeArgs),
    Cassandra(CassandraArgs),
    Desktop(DesktopArgs),
    LocalK8s(LocalK8sArgs),
    Marketing(MarketingArgs),
    MediaProxy(MediaProxyArgs),
    Tunnel(TunnelArgs),
    NativeVoiceIt(fluxer_dev::native_voice_it::NativeVoiceItArgs),
}

#[derive(Debug, Args)]
struct BootstrapArgs {
    #[arg(long)]
    skip_install: bool,
    #[arg(long)]
    skip_desktop_install: bool,
}

#[derive(Debug, Args)]
struct GatewayArgs {
    #[arg(value_parser = ["cluster", "single"], default_value = "cluster")]
    mode: String,
}

#[derive(Debug, Args)]
struct ProxyArgs {
    #[arg(long, default_value = "0.0.0.0")]
    host: String,
    #[arg(long, default_value_t = DEV_PROXY_PORT)]
    port: u16,
}

#[derive(Debug, Args)]
struct DevArgs {
    #[arg(long)]
    cloudflare_tunnel: bool,
    #[arg(long)]
    public_url: Option<String>,
    tasks: Vec<String>,
}

#[derive(Debug, Args)]
struct RustServicesArgs {
    services: Vec<String>,
}

#[derive(Debug, Args)]
struct SmokeArgs {
    #[arg(long)]
    quick: bool,
    #[arg(long)]
    public: bool,
}

#[derive(Debug, Args)]
struct CassandraArgs {
    #[command(subcommand)]
    command: CassandraCommand,
}

#[derive(Debug, Subcommand)]
enum CassandraCommand {
    Diff {
        #[arg(long)]
        output: Option<PathBuf>,
    },
    Apply,
    Verify,
    TargetSchema,
}

#[derive(Debug, Args)]
struct DesktopArgs {
    #[command(subcommand)]
    command: DesktopCommand,
}

#[derive(Debug, Subcommand)]
enum DesktopCommand {
    Install,
    Build {
        #[arg(long)]
        skip_native: bool,
    },
    Typecheck,
    SmokeBuild,
    Package {
        #[arg(trailing_var_arg = true, allow_hyphen_values = true)]
        builder_args: Vec<String>,
    },
    Run {
        #[arg(long, default_value = LOCAL_APP_URL)]
        app_url: String,
        #[arg(long)]
        no_build: bool,
        #[arg(trailing_var_arg = true, allow_hyphen_values = true)]
        extra_args: Vec<String>,
    },
    Canary {
        #[arg(long)]
        app_url: Option<String>,
        #[arg(long)]
        no_build: bool,
        #[arg(trailing_var_arg = true, allow_hyphen_values = true)]
        extra_args: Vec<String>,
    },
    #[command(hide = true)]
    ExecDisclaimed {
        program: String,
        #[arg(trailing_var_arg = true, allow_hyphen_values = true)]
        args: Vec<String>,
    },
}

#[derive(Debug, Args)]
struct LocalK8sArgs {
    #[command(subcommand)]
    command: LocalK8sCommand,
}

#[derive(Debug, Subcommand)]
enum LocalK8sCommand {
    CreateCluster,
    Kubectl {
        #[arg(trailing_var_arg = true, allow_hyphen_values = true)]
        args: Vec<String>,
    },
    Helm {
        #[arg(trailing_var_arg = true, allow_hyphen_values = true)]
        args: Vec<String>,
    },
    HotpatchSmoke,
    HandoffRolloutSmoke,
}

#[derive(Debug, Args)]
struct MarketingArgs {
    #[command(subcommand)]
    command: MarketingCommand,
}

#[derive(Debug, Subcommand)]
enum MarketingCommand {
    PreprocessBlogImage(fluxer_dev::marketing::PreprocessBlogImageArgs),
    PreprocessBlogVideo(fluxer_dev::marketing::PreprocessBlogVideoArgs),
}

#[derive(Debug, Args)]
struct MediaProxyArgs {
    #[command(subcommand)]
    command: MediaProxyCommand,
}

#[derive(Debug, Subcommand)]
#[allow(clippy::large_enum_variant)]
enum MediaProxyCommand {
    BeeGifBench,
    Doctor {
        #[arg(long)]
        repair: bool,
        #[arg(long, default_value = LOCAL_APP_URL)]
        base_url: String,
        #[arg(long)]
        path: Option<String>,
    },
    SeaweedfsIntegration {
        #[arg(long)]
        isolated_store: bool,
    },
    RustStressSmoke,
    StressCompare(fluxer_dev::media_stress::StressCompareArgs),
    SignExternalUrl(fluxer_dev::media_stress::SignExternalUrlArgs),
}

#[derive(Debug, Args)]
struct TunnelArgs {
    #[command(subcommand)]
    command: TunnelCommand,
}

#[derive(Debug, Subcommand)]
enum TunnelCommand {
    Configure {
        #[arg(long)]
        public_url: String,
        #[arg(long, hide_env_values = true)]
        token: Option<String>,
    },
    PrintEnv {
        #[arg(long)]
        public_url: String,
    },
    Run {
        #[arg(long, env = "FLUXER_CLOUDFLARE_TUNNEL_TOKEN", hide_env_values = true)]
        token: Option<String>,
        #[arg(long)]
        token_file: Option<PathBuf>,
    },
}

#[tokio::main]
async fn main() -> Result<()> {
    if std::env::args_os()
        .next()
        .and_then(|path| {
            std::path::PathBuf::from(path)
                .file_name()
                .map(|name| name.to_owned())
        })
        .as_deref()
        == Some(std::ffi::OsStr::new("docker"))
    {
        std::process::exit(fluxer_dev::local_k8s::run_docker_wrapper(
            std::env::args_os().skip(1),
        ));
    }

    let cli = Cli::parse();
    if !matches!(
        cli.command,
        Command::Build | Command::Knip | Command::Test | Command::Typecheck
    ) {
        apply_default_env()?;
    }

    match cli.command {
        Command::Bootstrap(args) => {
            fluxer_dev::bootstrap::bootstrap(args.skip_install, args.skip_desktop_install).await?;
        }
        Command::PostStart => fluxer_dev::bootstrap::post_start().await?,
        Command::Gateway(args) if args.mode == "single" => fluxer_dev::gateway::run_gateway()?,
        Command::Gateway(_) => {
            std::process::exit(fluxer_dev::gateway::run_gateway_cluster().await?)
        }
        Command::Build => std::process::exit(fluxer_dev::tasks::run_build()?),
        Command::Knip => std::process::exit(fluxer_dev::tasks::run_knip()?),
        Command::Test => std::process::exit(fluxer_dev::tasks::run_test()?),
        Command::Typecheck => std::process::exit(fluxer_dev::tasks::run_typecheck()?),
        Command::Proxy(args) => fluxer_dev::proxy::run_proxy(&args.host, args.port).await?,
        Command::Dev(args) => {
            if args.cloudflare_tunnel {
                fluxer_dev::tunnel::apply_cloudflare_public_url_env(args.public_url.as_deref())?;
            } else if let Some(public_url) = args.public_url.as_deref() {
                fluxer_dev::tunnel::apply_public_url_env(public_url)?;
            }
            std::process::exit(fluxer_dev::dev::run_dev(&args.tasks, args.cloudflare_tunnel).await?)
        }
        Command::RustServices(args) => {
            std::process::exit(fluxer_dev::rust_services::run_rust_services(&args.services).await?)
        }
        Command::Smoke(args) => fluxer_dev::smoke::run_smoke(args.quick, args.public).await?,
        Command::Cassandra(args) => match args.command {
            CassandraCommand::Diff { output } => {
                let diff = compute_diff(None).await?;
                let output = write_diff_file(&diff, output.as_deref())?;
                println!("Wrote Cassandra schema diff to {}", output.display());
                if !diff.errors.is_empty() {
                    for error in diff.errors {
                        println!("error: {error}");
                    }
                    std::process::exit(1);
                }
            }
            CassandraCommand::Apply => {
                apply_schema(None).await?;
            }
            CassandraCommand::Verify => verify_schema(None, None).await?,
            CassandraCommand::TargetSchema => print!("{}", render_target_schema("fluxer")),
        },
        Command::Desktop(args) => match args.command {
            DesktopCommand::Install => install_desktop()?,
            DesktopCommand::Build { skip_native } => build_desktop(skip_native)?,
            DesktopCommand::Typecheck => typecheck_desktop()?,
            DesktopCommand::SmokeBuild => smoke_build_desktop()?,
            DesktopCommand::Package { builder_args } => package_desktop(&builder_args)?,
            DesktopCommand::Run {
                app_url,
                no_build,
                extra_args,
            } => {
                let extra_args: Vec<_> = extra_args.into_iter().filter(|arg| arg != "--").collect();
                run_desktop(&app_url, &extra_args, !no_build)?;
            }
            DesktopCommand::Canary {
                app_url,
                no_build,
                extra_args,
            } => {
                let extra_args: Vec<_> = extra_args.into_iter().filter(|arg| arg != "--").collect();
                run_desktop_canary(app_url.as_deref(), &extra_args, !no_build).await?;
            }
            DesktopCommand::ExecDisclaimed { program, args } => {
                fluxer_dev::disclaim::exec_disclaimed(&program, &args)?
            }
        },
        Command::LocalK8s(args) => match args.command {
            LocalK8sCommand::CreateCluster => fluxer_dev::local_k8s::create_cluster().await?,
            LocalK8sCommand::Kubectl { args } => fluxer_dev::local_k8s::run_kubectl_cli(&args)?,
            LocalK8sCommand::Helm { args } => fluxer_dev::local_k8s::run_helm_cli(&args)?,
            LocalK8sCommand::HotpatchSmoke => fluxer_dev::local_k8s::run_hotpatch_smoke().await?,
            LocalK8sCommand::HandoffRolloutSmoke => {
                fluxer_dev::local_k8s::run_handoff_rollout_smoke().await?
            }
        },
        Command::Marketing(args) => match args.command {
            MarketingCommand::PreprocessBlogImage(args) => {
                fluxer_dev::marketing::preprocess_blog_image(args)?
            }
            MarketingCommand::PreprocessBlogVideo(args) => {
                fluxer_dev::marketing::preprocess_blog_video(args)?
            }
        },
        Command::MediaProxy(args) => match args.command {
            MediaProxyCommand::BeeGifBench => fluxer_dev::media_proxy::run_bee_gif_bench().await?,
            MediaProxyCommand::Doctor {
                repair,
                base_url,
                path,
            } => {
                fluxer_dev::media_proxy::run_dev_media_doctor(repair, &base_url, path.as_deref())
                    .await?;
            }
            MediaProxyCommand::SeaweedfsIntegration { isolated_store } => {
                fluxer_dev::media_proxy::run_seaweedfs_media_proxy_integration(isolated_store)
                    .await?;
            }
            MediaProxyCommand::RustStressSmoke => {
                fluxer_dev::media_proxy::run_rust_stress_smoke()?;
            }
            MediaProxyCommand::StressCompare(args) => {
                std::process::exit(fluxer_dev::media_stress::run_stress_compare(args).await?)
            }
            MediaProxyCommand::SignExternalUrl(args) => {
                println!(
                    "{}",
                    fluxer_dev::media_stress::sign_external_url(
                        &args.secret_key,
                        &args.server_url,
                        &args.upstream
                    )?
                );
            }
        },
        Command::Tunnel(args) => match args.command {
            TunnelCommand::Configure { public_url, token } => {
                fluxer_dev::tunnel::write_cloudflare_public_url_file(&public_url)?;
                if let Some(token) = token {
                    fluxer_dev::tunnel::write_cloudflare_token_file(&token)?;
                }
            }
            TunnelCommand::PrintEnv { public_url } => {
                print!("{}", fluxer_dev::tunnel::public_url_env_text(&public_url)?);
            }
            TunnelCommand::Run { token, token_file } => std::process::exit(
                fluxer_dev::tunnel::run_cloudflare_tunnel(token, token_file).await?,
            ),
        },
        Command::NativeVoiceIt(args) => fluxer_dev::native_voice_it::run(args).await?,
    }
    Ok(())
}

fn apply_default_env() -> Result<()> {
    let current: BTreeMap<String, String> = std::env::vars().collect();
    let merged = merge_default_env_with_current(
        DEV_ENV_FILE.as_path(),
        DEV_LOCAL_ENV_FILE.as_path(),
        ROOT_LOCAL_ENV_FILE.as_path(),
        current,
    )?;
    for (key, value) in merged {
        unsafe {
            std::env::set_var(key, value);
        }
    }
    Ok(())
}
