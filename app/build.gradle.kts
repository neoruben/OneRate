import java.util.Properties

plugins {
    alias(libs.plugins.android.application)
}

// Firma de la versión publicada: datos en keystore.properties (nunca se sube a git).
// Se busca en la raíz del proyecto y, si no está, en Documentos/claves (compartido con otras apps).
// Sin ese archivo, la versión release sale sin firmar.
val signingProps: Properties? = listOf(
    rootProject.file("keystore.properties"),
    File(System.getProperty("user.home"), "Documents/claves/keystore.properties"),
).firstOrNull { it.isFile }?.let { f -> Properties().apply { f.reader(Charsets.UTF_8).use { load(it) } } }

android {
    signingConfigs {
        if (signingProps != null) create("release") {
            storeFile = file(signingProps.getProperty("storeFile"))
            storePassword = signingProps.getProperty("storePassword")
            keyAlias = signingProps.getProperty("keyAlias")
            keyPassword = signingProps.getProperty("keyPassword")
        }
    }

    namespace = "com.onerate.app"
    compileSdk {
        version = release(37) {
            minorApiLevel = 2
        }
    }

    defaultConfig {
        applicationId = "io.github.neoruben.onerate"
        minSdk = 26
        targetSdk = 37
        versionCode = 5
        versionName = "1.0.4"

        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"

        ndk { abiFilters += "arm64-v8a" }
    }

    buildTypes {
        release {
            signingConfig = signingConfigs.findByName("release")
            // Sin optimización (R8): con GeckoView eliminaba código necesario y la app se cerraba al abrirla
            optimization {
                enable = false
                packageScope = setOf("androidx.**", "kotlin.**", "kotlinx.**")
            }
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    // Librerías nativas (casi todo es el motor de Firefox) comprimidas dentro del APK:
    // el archivo a descargar ocupa aproximadamente la mitad
    packaging {
        jniLibs {
            useLegacyPackaging = true
        }
    }
}

dependencies {
    implementation("org.mozilla.geckoview:geckoview:159.0.20261102144711")

    // Sin Jetpack Compose (la app no lo usa): solo lo imprescindible de AndroidX
    implementation("androidx.activity:activity-ktx:1.8.0")
    implementation(libs.androidx.core.ktx)
    testImplementation(libs.junit)
    androidTestImplementation(libs.androidx.espresso.core)
    androidTestImplementation(libs.androidx.junit)
}

configurations.all {
    resolutionStrategy.eachDependency {
        if (requested.group == "org.jetbrains.kotlin" && requested.name.startsWith("kotlin-stdlib")) {
            useVersion("2.2.0")
        }
    }
}