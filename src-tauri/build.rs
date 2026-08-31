fn main() {
    // Statically link the vendored sqlite-vec extension into every connection
    // opened by the bundled libsqlite3-sys. SQLITE_CORE links it against the
    // bundled SQLite symbols instead of the loadable-extension API indirection.
    cc::Build::new()
        .file("sqlite-vec/sqlite-vec.c")
        .define("SQLITE_CORE", None)
        .flag_if_supported("-fvisibility=hidden")
        .warnings(false)
        .compile("sqlite_vec");

    println!("cargo:rerun-if-changed=sqlite-vec/sqlite-vec.c");
    println!("cargo:rerun-if-changed=sqlite-vec/sqlite-vec.h");

    tauri_build::build()
}
